# TravelCRM Pro — Feature Development Guide

> **Purpose:** This document is the single source of truth for how to add a new feature to TravelCRM Pro. It is designed for both human developers and AI agents. When implementing a new feature, read this file first, then follow the steps exactly.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Step-by-Step: Adding a New Feature](#2-step-by-step-adding-a-new-feature)
3. [Backend Patterns (Cloudflare Workers + Hono.js)](#3-backend-patterns)
4. [Shared Package Patterns (Dart Models + API Client)](#4-shared-package-patterns)
5. [Flutter App Patterns (Riverpod + GoRouter)](#5-flutter-app-patterns)
6. [Checklist: Feature Completion](#6-checklist-feature-completion)
7. [Common Pitfalls](#7-common-pitfalls)
8. [Reference: Existing Feature Examples](#8-reference-existing-feature-examples)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Flutter App (packages/crm_app/)                        │
│  ConsumerWidget → Provider → Repository → ApiClient     │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP (Dio)
┌───────────────────▼─────────────────────────────────────┐
│  Shared Package (packages/shared/)                      │
│  ApiClient + ApiEndpoints + Models (Freezed)            │
└───────────────────┬─────────────────────────────────────┘
                    │ REST API
┌───────────────────▼─────────────────────────────────────┐
│  Backend (backend/)                                     │
│  Hono.js Routes → Drizzle ORM → D1 (SQLite)           │
│  Middleware: Auth → Tenant → RBAC                       │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Key Files |
|-------|-----------|-----------|
| **Backend** | Hono.js on Cloudflare Workers | `backend/src/index.ts` (entry), `backend/src/routes/` |
| **Database** | Cloudflare D1 (SQLite) via Drizzle ORM | `backend/src/db/tenant-schema.ts` |
| **Validation** | Zod | Inline in route files or `backend/src/validators/` |
| **Shared** | Dart package with Freezed models | `packages/shared/lib/` |
| **Frontend** | Flutter + Riverpod 2.0 + GoRouter | `packages/crm_app/lib/` |
| **State** | StateNotifier + Freezed state | `features/*/data/*_provider.dart` |

### Multi-Tenant Architecture

- **Master DB** (`MASTER_DB`): tenant registry + subscriptions
- **Tenant DB** (`TENANT_DB_{id}`): all business data, one per tenant
- Auth middleware extracts `tenantId` from JWT → Tenant middleware resolves the correct D1 database
- All routes automatically have access to `c.get('tenantDb')`, `c.get('userId')`, `c.get('role')`

---

## 2. Step-by-Step: Adding a New Feature

Follow these steps **in order**. Each step depends on the previous one.

### Step 1: Database Schema

**File:** `backend/src/db/tenant-schema.ts`

Add your table(s) at the bottom of the file, before the closing section. Follow these conventions:

```typescript
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Reuse the existing timestamp default:
const timestamp = sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;

export const myFeatures = sqliteTable('my_features', {
  // PRIMARY KEY: always TEXT with UUIDv7
  id: text('id').primaryKey(),

  // FOREIGN KEYS: always TEXT with .references()
  contactId: text('contact_id').notNull().references(() => contacts.id),
  leadId: text('lead_id').references(() => leads.id, { onDelete: 'cascade' }),

  // TEXT FIELDS
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('draft'),  // Use string enums

  // DATES: always TEXT with ISO 8601 format
  dueDate: text('due_date'),

  // MONEY: always REAL
  amount: real('amount').default(0),

  // BOOLEANS: always INTEGER (0/1)
  isActive: integer('is_active').default(1),

  // JSON: always TEXT (stringify on write, parse on read)
  tags: text('tags'),           // JSON array: '["tag1","tag2"]'
  detailsJson: text('details_json'),  // JSON object

  // SOFT DELETE
  isDeleted: integer('is_deleted').default(0),

  // AUDIT FIELDS (always include these)
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  // INDEXES: add on FKs, status, and frequently filtered columns
  index('my_features_contact_id_idx').on(table.contactId),
  index('my_features_status_idx').on(table.status),
  index('my_features_is_deleted_idx').on(table.isDeleted),
  index('my_features_created_by_idx').on(table.createdBy),
]);
```

**Rules:**
- Use `snake_case` for SQL column names
- Use `camelCase` for Drizzle field names
- Use UUIDv7 for all IDs (import from `backend/src/utils/uuid.ts`)
- Use TEXT for dates (ISO 8601), REAL for money, INTEGER for booleans
- Always add `isDeleted`, `createdBy`, `createdAt`, `updatedAt`
- Always add indexes on foreign keys and status columns

### Step 2: Database Migration

**File:** `backend/drizzle/tenant/XXXX_my_feature.sql`

Create a SQL migration file. Number it sequentially (check existing files).

```sql
-- Migration: Add my_features table
CREATE TABLE IF NOT EXISTS my_features (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  amount REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  tags TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS my_features_contact_id_idx ON my_features(contact_id);
CREATE INDEX IF NOT EXISTS my_features_status_idx ON my_features(status);
CREATE INDEX IF NOT EXISTS my_features_is_deleted_idx ON my_features(is_deleted);
```

### Step 3: Backend Route

**File:** `backend/src/routes/my-feature.ts` (create new file)

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, created, paginated, error, notFound } from '../utils/response';
import { uuidv7 } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';

const app = new Hono<AppContext>();

// ── Validation Schemas ──────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  contactId: z.string().min(1),
  status: z.enum(['draft', 'active', 'completed']).optional(),
  amount: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  // ... more fields
});

const updateSchema = createSchema.partial(); // All fields optional for PATCH

// ── LIST (GET /) ────────────────────────────────────────

app.get('/', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  // Parse query params
  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status');
  const sortBy = url.searchParams.get('sortBy') || 'created_at';
  const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'ASC' : 'DESC';

  // Build WHERE clause
  const conditions: string[] = ['mf.is_deleted = 0'];
  const bindings: any[] = [];

  // RBAC: restrict by role if needed
  if (role === 'salesperson') {
    conditions.push('mf.created_by = ?');
    bindings.push(userId);
  }

  if (search) {
    conditions.push('mf.name LIKE ?');
    bindings.push(`%${search}%`);
  }

  if (status) {
    conditions.push('mf.status = ?');
    bindings.push(status);
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM my_features mf WHERE ${whereClause}`)
    .bind(...bindings)
    .first<{ count: number }>();
  const total = countResult?.count ?? 0;

  // Fetch page
  const rows = await db
    .prepare(`
      SELECT mf.*, c.name as contact_name
      FROM my_features mf
      LEFT JOIN contacts c ON c.id = mf.contact_id
      WHERE ${whereClause}
      ORDER BY mf.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `)
    .bind(...bindings, limit, offset)
    .all();

  // Parse JSON fields before returning
  const data = (rows.results || []).map(parseRow);

  return paginated(c, data, total, page, limit);
});

// ── GET BY ID (GET /:id) ────────────────────────────────

app.get('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const row = await db
    .prepare(`
      SELECT mf.*, c.name as contact_name
      FROM my_features mf
      LEFT JOIN contacts c ON c.id = mf.contact_id
      WHERE mf.id = ? AND mf.is_deleted = 0
    `)
    .bind(id)
    .first();

  if (!row) return notFound(c, 'Feature');

  return success(c, parseRow(row));
});

// ── CREATE (POST /) ─────────────────────────────────────

app.post('/', zValidator('json', createSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const id = uuidv7();

  await db
    .prepare(`
      INSERT INTO my_features (id, contact_id, name, status, amount, tags, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .bind(
      id,
      data.contactId,
      data.name,
      data.status || 'draft',
      data.amount || 0,
      data.tags ? JSON.stringify(data.tags) : null,
      userId,
    )
    .run();

  // Log activity
  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'my_feature',
    entityId: id,
    details: JSON.stringify({ name: data.name }),
    ipAddress: c.get('clientIp'),
  });

  const row = await db.prepare('SELECT * FROM my_features WHERE id = ?').bind(id).first();
  return created(c, parseRow(row!));
});

// ── UPDATE (PUT /:id) ───────────────────────────────────

app.put('/:id', zValidator('json', updateSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const existing = await db
    .prepare('SELECT * FROM my_features WHERE id = ? AND is_deleted = 0')
    .bind(id)
    .first();
  if (!existing) return notFound(c, 'Feature');

  // Build SET clause dynamically
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const params: any[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
  if (data.amount !== undefined) { sets.push('amount = ?'); params.push(data.amount); }
  if (data.tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(data.tags)); }

  params.push(id);
  await db.prepare(`UPDATE my_features SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  const row = await db.prepare('SELECT * FROM my_features WHERE id = ?').bind(id).first();
  return success(c, parseRow(row!));
});

// ── DELETE (DELETE /:id) ────────────────────────────────

app.delete('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  // Soft delete
  await db
    .prepare("UPDATE my_features SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();

  return success(c, { message: 'Deleted' });
});

// ── Helper: Parse DB row → API response ─────────────────

function parseRow(row: Record<string, any>) {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name ?? null,
    name: row.name,
    status: row.status ?? 'draft',
    amount: row.amount ?? 0,
    tags: row.tags ? JSON.parse(row.tags) : [],
    isActive: row.is_active === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default app;
```

### Step 4: Register the Route

**File:** `backend/src/index.ts`

Add your route to the `routeMounts` array:

```typescript
import myFeatureRoutes from './routes/my-feature';

// In the routeMounts array:
const routeMounts: Array<[string, typeof authRoutes]> = [
  // ... existing routes
  ['my-features', myFeatureRoutes],  // ADD THIS
];
```

This auto-mounts at both `/api/v1/my-features` and `/api/my-features`.

### Step 5: Shared Model (Dart)

**File:** `packages/shared/lib/models/my_feature_model.dart`

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'my_feature_model.freezed.dart';
part 'my_feature_model.g.dart';

@freezed
class MyFeatureModel with _$MyFeatureModel {
  const factory MyFeatureModel({
    required String id,
    required String contactId,
    String? contactName,
    required String name,
    @Default('draft') String status,
    @Default(0) double amount,
    @Default([]) List<String> tags,
    @Default(true) bool isActive,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _MyFeatureModel;

  factory MyFeatureModel.fromJson(Map<String, dynamic> json) =>
      _$MyFeatureModelFromJson(json);
}

@freezed
class MyFeatureListResponse with _$MyFeatureListResponse {
  const factory MyFeatureListResponse({
    required List<MyFeatureModel> data,
    PaginationInfo? pagination,
  }) = _MyFeatureListResponse;

  factory MyFeatureListResponse.fromJson(Map<String, dynamic> json) =>
      _$MyFeatureListResponseFromJson(json);
}

@freezed
class PaginationInfo with _$PaginationInfo {
  const factory PaginationInfo({
    required int total,
    required int page,
    required int limit,
    required int totalPages,
    required bool hasMore,
  }) = _PaginationInfo;

  factory PaginationInfo.fromJson(Map<String, dynamic> json) =>
      _$PaginationInfoFromJson(json);
}
```

**After creating:** Run code generation:
```bash
# In bash (not PowerShell)
cd packages/shared && dart run build_runner build --delete-conflicting-outputs
```

### Step 6: API Endpoints (Shared)

**File:** `packages/shared/lib/api_client/api_endpoints.dart`

Add your endpoints to the `ApiEndpoints` class:

```dart
class ApiEndpoints {
  // ... existing endpoints

  // My Features
  static const String myFeatures = '$_base/my-features';
  static String myFeature(String id) => '$_base/my-features/$id';
  static String myFeatureStatus(String id) => '$_base/my-features/$id/status';
}
```

### Step 7: Export from Shared

**File:** `packages/shared/lib/shared.dart`

Add the model export:

```dart
// Models
export 'models/my_feature_model.dart';  // ADD THIS
```

### Step 8: Flutter Repository

**File:** `packages/crm_app/lib/features/my_feature/data/my_feature_repository.dart`

```dart
import 'package:shared/shared.dart';

class MyFeatureRepository {
  final ApiClient _apiClient;

  MyFeatureRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<MyFeatureListResponse> getList({
    int page = 1,
    int limit = 20,
    String? search,
    String? status,
    String sortBy = 'createdAt',
    String sortOrder = 'desc',
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
      if (search != null && search.isNotEmpty) 'search': search,
      if (status != null) 'status': status,
    };

    final response = await _apiClient.get(
      ApiEndpoints.myFeatures,
      queryParameters: params,
    );
    return MyFeatureListResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<MyFeatureModel> getById(String id) async {
    final response = await _apiClient.get(ApiEndpoints.myFeature(id));
    return MyFeatureModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<MyFeatureModel> create(Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.myFeatures, data: data);
    return MyFeatureModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<MyFeatureModel> update(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(ApiEndpoints.myFeature(id), data: data);
    return MyFeatureModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> delete(String id) async {
    await _apiClient.delete(ApiEndpoints.myFeature(id));
  }
}
```

### Step 9: Flutter State + Provider

**File:** `packages/crm_app/lib/features/my_feature/data/my_feature_state.dart`

```dart
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:shared/shared.dart';

part 'my_feature_state.freezed.dart';

enum MyFeatureListStatus { initial, loading, loaded, error }

@freezed
class MyFeatureListState with _$MyFeatureListState {
  const factory MyFeatureListState({
    @Default(MyFeatureListStatus.initial) MyFeatureListStatus status,
    @Default([]) List<MyFeatureModel> items,
    @Default('') String search,
    String? statusFilter,
    @Default('createdAt') String sortBy,
    @Default('desc') String sortOrder,
    PaginationInfo? pagination,
    String? error,
  }) = _MyFeatureListState;
}

extension MyFeatureListStateX on MyFeatureListState {
  bool get hasActiveFilters => search.isNotEmpty || statusFilter != null;
  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
}
```

**File:** `packages/crm_app/lib/features/my_feature/data/my_feature_provider.dart`

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../auth/data/auth_provider.dart';
import 'my_feature_repository.dart';
import 'my_feature_state.dart';

final myFeatureRepositoryProvider = Provider<MyFeatureRepository>(
  (ref) => MyFeatureRepository(apiClient: ref.read(apiClientProvider)),
);

final myFeatureListProvider =
    StateNotifierProvider<MyFeatureListNotifier, MyFeatureListState>(
  (ref) => MyFeatureListNotifier(repository: ref.read(myFeatureRepositoryProvider)),
);

class MyFeatureListNotifier extends StateNotifier<MyFeatureListState> {
  final MyFeatureRepository _repository;

  MyFeatureListNotifier({required MyFeatureRepository repository})
      : _repository = repository,
        super(const MyFeatureListState());

  Future<void> load({bool refresh = false}) async {
    if (state.status == MyFeatureListStatus.loading) return;

    state = state.copyWith(
      status: MyFeatureListStatus.loading,
      items: refresh ? [] : state.items,
    );

    try {
      final response = await _repository.getList(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: MyFeatureListStatus.loaded,
        items: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: MyFeatureListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == MyFeatureListStatus.loading) return;
    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: MyFeatureListStatus.loading);

    try {
      final response = await _repository.getList(
        page: nextPage,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: MyFeatureListStatus.loaded,
        items: [...state.items, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: MyFeatureListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    load(refresh: true);
  }

  void setStatusFilter(String? status) {
    state = state.copyWith(statusFilter: status);
    load(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(search: '', statusFilter: null);
    load(refresh: true);
  }

  String? _extractError(dynamic e) {
    if (e is DioException) {
      return e.response?.data?['error']?['message'] ?? e.message ?? 'Unknown error';
    }
    return e.toString();
  }
}
```

### Step 10: Flutter Screens

**File:** `packages/crm_app/lib/features/my_feature/presentation/screens/my_feature_list_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../data/my_feature_provider.dart';
import '../../data/my_feature_state.dart';

class MyFeatureListScreen extends ConsumerStatefulWidget {
  const MyFeatureListScreen({super.key});

  @override
  ConsumerState<MyFeatureListScreen> createState() => _MyFeatureListScreenState();
}

class _MyFeatureListScreenState extends ConsumerState<MyFeatureListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(myFeatureListProvider.notifier).load(refresh: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(myFeatureListProvider);

    return Column(
      children: [
        // Search + filter bar
        Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: 'Search...',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (v) => ref.read(myFeatureListProvider.notifier).setSearch(v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              ElevatedButton.icon(
                onPressed: () => context.push('/my-features/new'),
                icon: const Icon(Icons.add),
                label: const Text('Add New'),
              ),
            ],
          ),
        ),
        // Body
        Expanded(child: _buildBody(context, state)),
      ],
    );
  }

  Widget _buildBody(BuildContext context, MyFeatureListState state) {
    if (state.status == MyFeatureListStatus.loading && state.items.isEmpty) {
      return const Center(child: AppLoading());
    }
    if (state.status == MyFeatureListStatus.error && state.items.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load',
        onRetry: () => ref.read(myFeatureListProvider.notifier).load(refresh: true),
      );
    }
    if (state.items.isEmpty) {
      return AppEmptyState(
        icon: Icons.inventory_2_outlined,
        title: 'No items found',
        subtitle: state.hasActiveFilters
            ? 'Try adjusting your filters'
            : 'Create your first item to get started',
      );
    }

    return AppDataTable<MyFeatureModel>(
      columns: [
        AppDataColumn(title: 'Name', field: 'name', sortable: true),
        AppDataColumn(title: 'Status', field: 'status'),
        AppDataColumn(title: 'Contact', field: 'contactName'),
        AppDataColumn(title: 'Amount', field: 'amount'),
        AppDataColumn(title: 'Created', field: 'createdAt', sortable: true),
      ],
      rows: state.items,
      rowValueFor: (item, field) => switch (field) {
        'name' => item.name,
        'status' => item.status,
        'contactName' => item.contactName ?? '-',
        'amount' => '₹${item.amount.toStringAsFixed(2)}',
        'createdAt' => item.createdAt ?? '-',
        _ => '-',
      },
      sortState: SortState(field: state.sortBy, ascending: state.sortOrder == 'asc'),
      onSort: (s) {
        // Update sort in provider
      },
      pagination: state.pagination != null
          ? PaginationState(
              page: state.pagination!.page,
              pageSize: state.pagination!.limit,
              total: state.pagination!.total,
            )
          : null,
      onRowTap: (index) => context.push('/my-features/${state.items[index].id}'),
    );
  }
}
```

**File:** `packages/crm_app/lib/features/my_feature/presentation/screens/my_feature_form_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../data/my_feature_provider.dart';

class MyFeatureFormScreen extends ConsumerStatefulWidget {
  final String? id; // null = create, non-null = edit

  const MyFeatureFormScreen({super.key, this.id});

  @override
  ConsumerState<MyFeatureFormScreen> createState() => _MyFeatureFormScreenState();
}

class _MyFeatureFormScreenState extends ConsumerState<MyFeatureFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _initializing = true;

  // Form fields
  String _name = '';
  String? _contactId;
  double? _amount;
  String? _notes;

  bool get _isEdit => widget.id != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _loadItem();
    } else {
      setState(() => _initializing = false);
    }
  }

  Future<void> _loadItem() async {
    try {
      final repo = ref.read(myFeatureRepositoryProvider);
      final item = await repo.getById(widget.id!);
      setState(() {
        _name = item.name;
        _contactId = item.contactId;
        _amount = item.amount;
        _initializing = false;
      });
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to load item');
      context.pop();
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      final data = {
        'name': _name,
        'contactId': _contactId,
        'amount': _amount,
      };

      final repo = ref.read(myFeatureRepositoryProvider);
      _isEdit
          ? await repo.update(widget.id!, data)
          : await repo.create(data);

      if (!mounted) return;
      AppSnackbar.success(context, _isEdit ? 'Updated' : 'Created');
      context.pop();
      ref.read(myFeatureListProvider.notifier).load(refresh: true);
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to save');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) return const Center(child: AppLoading());

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            TextFormField(
              initialValue: _name,
              decoration: const InputDecoration(labelText: 'Name *'),
              validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null,
              onChanged: (v) => _name = v,
            ),
            const SizedBox(height: AppTheme.spacingMd),
            // ... more form fields
            const SizedBox(height: AppTheme.spacingLg),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_isEdit ? 'Update' : 'Create'),
            ),
          ],
        ),
      ),
    );
  }
}
```

### Step 11: Register Routes (GoRouter)

**File:** `packages/crm_app/lib/app/router.dart`

Add routes inside the `routes` list (within the authenticated section):

```dart
GoRoute(
  path: '/my-features',
  builder: (context, state) => const AppScaffold(
    child: MyFeatureListScreen(),
    title: 'My Features',
  ),
  routes: [
    GoRoute(
      path: 'new',
      builder: (context, state) => const AppScaffold(
        child: MyFeatureFormScreen(),
        title: 'New Feature',
      ),
    ),
    GoRoute(
      path: ':id',
      builder: (context, state) => AppScaffold(
        child: MyFeatureDetailScreen(id: state.pathParameters['id']!),
        title: 'Feature Details',
      ),
      routes: [
        GoRoute(
          path: 'edit',
          builder: (context, state) => AppScaffold(
            child: MyFeatureFormScreen(id: state.pathParameters['id']),
            title: 'Edit Feature',
          ),
        ),
      ],
    ),
  ],
),
```

### Step 12: Add to Sidebar Navigation

**File:** `packages/crm_app/lib/core/widgets/app_scaffold.dart`

Add a menu item to `kMenuItems`:

```dart
const List<SidebarMenuItem> kMenuItems = [
  // ... existing items
  SidebarMenuItem(
    label: 'My Features',
    icon: Icons.star_outlined,
    route: '/my-features',
    roles: ['admin', 'sales_manager'],  // null = visible to all
  ),
];
```

### Step 13: Run Code Generation

```bash
# Generate Freezed + JSON serializable code for shared package
cd packages/shared && dart run build_runner build --delete-conflicting-outputs

# Generate for crm_app (if state files use Freezed)
cd packages/crm_app && dart run build_runner build --delete-conflicting-outputs
```

---

## 3. Backend Patterns

### Response Helpers

Always use helpers from `backend/src/utils/response.ts`:

```typescript
success(c, data)                        // 200 {success: true, data}
created(c, data)                        // 201
paginated(c, data, total, page, limit)  // 200 with pagination metadata
error(c, message, 400)                  // {success: false, error: {message}}
notFound(c, 'Lead')                     // 404
unauthorized(c, 'msg')                  // 401
forbidden(c, 'msg')                     // 403
validationError(c, {field: ['err']})    // 422
```

### UUID Generation

Always use UUIDv7:
```typescript
import { uuidv7 } from '../utils/uuid';
const id = uuidv7();
```

### RBAC Patterns

```typescript
import { rbac } from '../middleware/rbac';

// Restrict entire route to specific roles
app.use('/*', rbac(['admin', 'sales_manager']));

// Or per-endpoint
app.delete('/:id', rbac(['admin']), async (c) => { ... });

// Or check role in handler
const role = c.get('role');
if (role === 'salesperson') {
  conditions.push('created_by = ?');
  bindings.push(c.get('userId'));
}
```

### Queue Integration

To send background jobs:
```typescript
// Email
await c.env.EMAIL_QUEUE.send({ type: 'email', data: { to, subject, html } });

// SMS
await c.env.SMS_QUEUE.send({ type: 'sms', data: { to, body } });

// Push notification
await c.env.PUSH_NOTIFICATION_QUEUE.send({ type: 'push', data: { userId, title, body } });
```

### Realtime Broadcast

```typescript
// Broadcast changes to connected WebSocket clients
const realtimeId = c.env.REALTIME.idFromName(c.get('tenantId'));
const stub = c.env.REALTIME.get(realtimeId);
await stub.fetch('http://internal/broadcast', {
  method: 'POST',
  body: JSON.stringify({ type: 'my_feature_updated', data: { id } }),
});
```

---

## 4. Shared Package Patterns

### Model Conventions

- Use `@freezed` for all models
- Use `@Default()` for optional fields with defaults
- Use `@JsonKey(name: 'field')` when JSON key differs from Dart field name
- Use custom converters for complex JSON parsing (see `_DestinationsConverter` in `lead_model.dart`)
- Always include `fromJson` factory

### API Endpoint Naming

```dart
// Collection (plural)
static const String myFeatures = '$_base/my-features';

// Single resource (method with ID parameter)
static String myFeature(String id) => '$_base/my-features/$id';

// Sub-resources
static String myFeatureStatus(String id) => '$_base/my-features/$id/status';
static String myFeatureItems(String id) => '$_base/my-features/$id/items';
```

---

## 5. Flutter App Patterns

### Feature Directory Structure

Every feature follows this structure:
```
features/my_feature/
├── data/
│   ├── my_feature_repository.dart   # API calls
│   ├── my_feature_provider.dart     # Riverpod providers + StateNotifier
│   └── my_feature_state.dart        # Freezed state model
└── presentation/
    ├── screens/
    │   ├── my_feature_list_screen.dart
    │   ├── my_feature_detail_screen.dart
    │   └── my_feature_form_screen.dart
    └── widgets/
        ├── my_feature_card.dart
        └── my_feature_filter_bar.dart
```

### Provider Hierarchy

```dart
// 1. API Client (global singleton)
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

// 2. Repository (per-feature, depends on API client)
final myFeatureRepositoryProvider = Provider<MyFeatureRepository>(
  (ref) => MyFeatureRepository(apiClient: ref.read(apiClientProvider)),
);

// 3. List state (per-feature, depends on repository)
final myFeatureListProvider = StateNotifierProvider<MyFeatureListNotifier, MyFeatureListState>(
  (ref) => MyFeatureListNotifier(repository: ref.read(myFeatureRepositoryProvider)),
);
```

### Widget Patterns

- **List screens:** `ConsumerStatefulWidget` → load data in `initState` via `addPostFrameCallback`
- **Form screens:** `ConsumerStatefulWidget` → local state with `setState`, `ref.read(repo)` for API calls
- **Detail screens:** `ConsumerWidget` or `ConsumerStatefulWidget` with tabs
- **Widgets:** `ConsumerWidget` for provider access, `StatelessWidget` for pure UI

### Navigation

```dart
// Push to a new route
context.push('/my-features/${item.id}');

// Go back
context.pop();

// Replace current route
context.go('/my-features');

// Pass query parameters
context.push('/my-features/new?contactId=$contactId');

// Read parameters in screen
final id = state.pathParameters['id']!;
final contactId = state.uri.queryParameters['contactId'];
```

### Error Handling Pattern

```dart
try {
  final result = await repo.someOperation();
  if (!mounted) return;
  AppSnackbar.success(context, 'Success message');
} catch (e) {
  if (!mounted) return;
  AppSnackbar.error(context, _extractError(e));
}

String _extractError(dynamic e) {
  if (e is DioException) {
    return e.response?.data?['error']?['message'] ?? e.message ?? 'Unknown error';
  }
  return e.toString();
}
```

### Running Flutter Commands

**IMPORTANT**: Flutter commands MUST run via x86 PowerShell:
```bash
"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd packages/crm_app && flutter run -d chrome"
```

Node.js/npm/git commands run normally in bash.

---

## 6. Checklist: Feature Completion

Use this checklist when implementing any new feature:

### Backend
- [ ] Schema added to `tenant-schema.ts` with proper types, defaults, indexes
- [ ] Migration SQL file created in `backend/drizzle/tenant/`
- [ ] Route file created with CRUD endpoints (GET list, GET by ID, POST, PUT, DELETE)
- [ ] Zod validation schemas for create/update
- [ ] RBAC applied (role checks or middleware)
- [ ] Pagination on list endpoints (page, limit, total)
- [ ] Search support on list endpoints
- [ ] Soft delete (set `is_deleted = 1`, never hard delete)
- [ ] Activity logging on create/update/delete
- [ ] JSON fields stringified on write, parsed in `parseRow()`
- [ ] Route registered in `backend/src/index.ts`

### Shared Package
- [ ] Freezed model created with all fields matching API response
- [ ] List response model with pagination
- [ ] API endpoints added to `ApiEndpoints` class
- [ ] Model exported from `shared.dart` barrel file
- [ ] Code generation run (`build_runner build`)

### Flutter App
- [ ] Repository with CRUD methods
- [ ] State model (Freezed) with status enum, items, filters, pagination
- [ ] Provider (StateNotifier) with load, loadNextPage, search, filter, clearFilters
- [ ] List screen with search, filters, data table, empty state, error state, loading state
- [ ] Form screen with create/edit modes, validation, submit, snackbar feedback
- [ ] Detail screen (if needed)
- [ ] Routes registered in `router.dart`
- [ ] Sidebar item added to `app_scaffold.dart` (if top-level feature)
- [ ] Code generation run for state files

---

## 7. Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Forgot to parse JSON fields in backend response | Add `JSON.parse()` in `parseRow()` for tags, detailsJson, etc. |
| Used random UUID instead of UUIDv7 | Import from `utils/uuid.ts`, use `uuidv7()` |
| Hardcoded tenant DB instead of `c.get('tenantDb')` | Always use `c.get('tenantDb')` — middleware resolves it |
| Missing `is_deleted = 0` filter in queries | Add to ALL WHERE clauses |
| Forgot `if (!mounted) return` after async in Flutter | Always check `mounted` before `setState` or navigation |
| Used `ref.watch()` in callbacks | Use `ref.read()` in callbacks/event handlers, `ref.watch()` only in `build()` |
| Missing pagination in list endpoint | Always add `LIMIT ? OFFSET ?` and return pagination metadata |
| Schema column name doesn't match API response | Use `parseRow()` to map `snake_case` DB → `camelCase` API |

---

## 8. Reference: Existing Feature Examples

Use these as templates when building similar features:

| Feature Type | Best Reference |
|-------------|---------------|
| Simple CRUD | `features/suppliers/` (backend: `routes/suppliers.ts`) |
| Complex CRUD + Pipeline | `features/leads/` (backend: `routes/leads.ts`) |
| Hierarchical data (parent/child) | `features/itineraries/` (itinerary → days → items) |
| Financial with tax | `features/invoices/` (backend: `routes/invoices.ts`) |
| Communication/Messaging | `features/communications/` (templates, logs, bulk send) |
| Settings/Config | `features/settings/` (company settings, user management) |
| Import/Export | `features/imports/` + `features/exports/` |
| Reports/Analytics | `features/reports/` (multiple report types) |
| Kanban board | `features/leads/presentation/widgets/kanban_board.dart` |
| Calendar/Planner | `features/planner/` |
| File upload | `features/visa/` (document uploads to R2) |

### Key Files to Read First

```
backend/src/index.ts                          # How routes are mounted
backend/src/db/tenant-schema.ts               # All database tables
backend/src/routes/leads.ts                   # Most complete route example
backend/src/types.ts                          # Env bindings + AppContext
packages/shared/lib/api_client/api_endpoints.dart  # All API endpoints
packages/shared/lib/models/lead_model.dart         # Most complete model
packages/crm_app/lib/app/router.dart               # All routes
packages/crm_app/lib/core/widgets/app_scaffold.dart # Sidebar menu
packages/crm_app/lib/features/leads/               # Complete feature reference
```
