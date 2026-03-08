# API Client Layer Usage Guide

## Overview

The API client layer provides a complete, type-safe interface for communicating with the TravelCRM Pro backend (Cloudflare Workers + Hono). The client includes:

- Centralized HTTP client with JWT authentication
- Automatic token refresh on 401 responses
- Domain-specific API modules for all features
- React hooks for data fetching and mutations
- Full TypeScript support with strict type checking

## Configuration

Set the API base URL in your environment:

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8787/api/v1
```

The default is `http://localhost:8787/api/v1` if not set.

## Authentication

### Login Flow

```typescript
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

async function handleLogin(email: string, password: string) {
  const store = useAuthStore.getState();

  const response = await authApi.login({
    email,
    password,
    tenantId: selectedTenant?.id,
  });

  if (response.data) {
    store.setAuth({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      user: response.data.user,
      tenant: response.data.tenant,
    });
  }
}
```

### Token Management

The client automatically:
- Attaches the JWT token from auth store to all requests
- Detects 401 responses and attempts token refresh
- Redirects to `/login` if refresh fails
- Handles token persistence via Zustand + localStorage

No manual token handling needed in components.

## Using API Modules

### Basic CRUD Operations

```typescript
import { contactsApi, leadsApi } from '@/lib/api';

// Fetch paginated contacts
const response = await contactsApi.list({
  page: 1,
  limit: 20,
  search: 'John',
  sortBy: 'createdAt',
  sortOrder: 'desc',
});

// Fetch single record
const contact = await contactsApi.getById('contact-123');

// Create new record
const newContact = await contactsApi.create({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  type: 'individual',
});

// Update record
const updated = await contactsApi.update('contact-123', {
  firstName: 'Jane',
  email: 'jane@example.com',
});

// Delete record
await contactsApi.delete('contact-123');
```

### Specialized Operations

```typescript
// Check for duplicate contacts
const duplicates = await contactsApi.checkDuplicate({
  email: 'john@example.com',
  phone: '+1234567890',
});

// Merge contacts
const merged = await contactsApi.merge({
  primaryId: 'contact-1',
  secondaryId: 'contact-2',
  mergeFields: {
    email: 'primary',
    phone: 'secondary',
  },
});

// Share contact
await contactsApi.share('contact-123', {
  userId: 'user-456',
  note: 'Please review this client',
});

// Export contacts as CSV
const csvBlob = await contactsApi.export();
```

## React Hooks

### useApiQuery - Data Fetching

```typescript
'use client';

import { useApiQuery } from '@/hooks/use-api';
import { contactsApi } from '@/lib/api';

export function ContactsList() {
  const { data, loading, error, refetch } = useApiQuery(
    () => contactsApi.list({ page: 1, limit: 20 }),
    [], // dependencies
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <>
      <button onClick={() => refetch()}>Refresh</button>
      <ul>
        {data?.data?.map((contact) => (
          <li key={contact.id}>{contact.name}</li>
        ))}
      </ul>
    </>
  );
}
```

### useApiMutation - Create/Update/Delete

```typescript
'use client';

import { useApiMutation } from '@/hooks/use-api';
import { contactsApi } from '@/lib/api';

export function CreateContactForm() {
  const { mutate, loading, error } = useApiMutation(
    (formData) => contactsApi.create(formData),
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const result = await mutate({
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string,
    });

    if (result) {
      console.log('Contact created:', result);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="firstName" required />
      <input name="lastName" />
      <input name="email" type="email" />
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Contact'}
      </button>
      {error && <p className="error">{error.message}</p>}
    </form>
  );
}
```

### usePaginatedQuery - Pagination

```typescript
'use client';

import { usePaginatedQuery } from '@/hooks/use-api';
import { leadsApi } from '@/lib/api';

export function LeadsList() {
  const { data, pagination, loading, error, setPage, setLimit } =
    usePaginatedQuery(
      (page, limit) => leadsApi.list({ page, limit, status: 'open' }),
      1, // initial page
      10, // initial limit
    );

  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}

      <table>
        <tbody>
          {data.map((lead) => (
            <tr key={lead.id}>
              <td>{lead.name}</td>
              <td>{lead.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button onClick={() => setPage(pagination.page - 1)} disabled={pagination.page === 1}>
          Prev
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          onClick={() => setPage(pagination.page + 1)}
          disabled={pagination.page === pagination.totalPages}
        >
          Next
        </button>
      </div>

      <select value={pagination.limit} onChange={(e) => setLimit(Number(e.target.value))}>
        <option value={10}>10 per page</option>
        <option value={20}>20 per page</option>
        <option value={50}>50 per page</option>
      </select>
    </div>
  );
}
```

### useApiInfiniteQuery - Infinite Scroll

```typescript
'use client';

import { useApiInfiniteQuery } from '@/hooks/use-api';
import { contactsApi } from '@/lib/api';

export function InfiniteContactList() {
  const { data, loading, hasMore, loadMore, refetch } = useApiInfiniteQuery(
    (page, limit) => contactsApi.list({ page, limit }),
    15, // items per page
  );

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 &&
        hasMore &&
        !loading
      ) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, loadMore]);

  return (
    <div>
      {data.map((contact) => (
        <div key={contact.id}>{contact.name}</div>
      ))}
      {loading && <div>Loading more...</div>}
      {!hasMore && <div>No more contacts</div>}
      <button onClick={() => refetch()}>Reset</button>
    </div>
  );
}
```

## File Upload

For endpoints that accept file uploads (documents, logos, etc.):

```typescript
import { documentsApi } from '@/lib/api';

async function uploadDocument(file: File) {
  const doc = await documentsApi.upload({
    file,
    name: 'Invoice 2024',
    description: 'Invoice for January 2024',
    category: 'invoices',
    leadId: 'lead-123',
  });

  console.log('Uploaded:', doc.data);
}
```

## Exporting Data

Binary responses (CSV, PDF) are returned as Blobs:

```typescript
import { contactsApi, exportsApi } from '@/lib/api';

// Export contacts as CSV
const csvBlob = await contactsApi.export({
  format: 'csv',
  filters: { type: 'corporate' },
});

// Download file
const url = URL.createObjectURL(csvBlob);
const a = document.createElement('a');
a.href = url;
a.download = 'contacts.csv';
a.click();
URL.revokeObjectURL(url);

// Export invoices as bulk PDF
const pdfBlob = await exportsApi.invoicesBulkPdf({
  invoiceIds: ['inv-1', 'inv-2', 'inv-3'],
  combineIntoSinglePdf: true,
});
```

## Error Handling

All API errors follow a consistent structure:

```typescript
import type { ApiError } from '@/lib/api';

try {
  await contactsApi.create({ firstName: '' });
} catch (error: unknown) {
  const apiError = error as ApiError;
  console.log('Status:', apiError.status);
  console.log('Message:', apiError.message);
  console.log('Code:', apiError.code);

  // Field-level validation errors
  if (apiError.errors) {
    for (const [field, messages] of Object.entries(apiError.errors)) {
      console.log(`${field}: ${messages.join(', ')}`);
    }
  }
}
```

Common status codes:
- `200` - Success
- `400` - Bad request (validation errors in `.errors`)
- `401` - Unauthorized (auto-handled with token refresh)
- `403` - Forbidden
- `404` - Not found
- `500` - Server error

## Authentication Store

Access and update auth state from components:

```typescript
import { useAuthStore } from '@/stores/auth-store';

export function ProfileHeader() {
  const { user, logout } = useAuthStore();

  if (!user) return null;

  return (
    <div>
      <p>Welcome, {user.firstName}</p>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}
```

## Type-Safe Responses

All API methods return properly typed responses:

```typescript
import { contactsApi, type ApiResponse, type PaginatedResponse } from '@/lib/api';

const response: ApiResponse<PaginatedResponse<Contact>> = await contactsApi.list();

// TypeScript knows the structure
response.data.data // Contact[]
response.data.pagination.page // number
response.data.pagination.total // number
```

## API Reference by Domain

### Contacts
- `contactsApi.list()` - List contacts
- `contactsApi.getById()` - Get contact
- `contactsApi.create()` - Create contact
- `contactsApi.update()` - Update contact
- `contactsApi.delete()` - Delete contact
- `contactsApi.getTimeline()` - Get activity timeline
- `contactsApi.getTags()` - Get available tags
- `contactsApi.checkDuplicate()` - Find duplicates
- `contactsApi.merge()` - Merge contacts
- `contactsApi.share()` - Share with user
- `contactsApi.export()` - Export contacts

### Leads
- `leadsApi.list()` - List leads
- `leadsApi.getById()` - Get lead
- `leadsApi.create()` - Create lead
- `leadsApi.update()` - Update lead
- `leadsApi.updateStatus()` - Change lead status
- `leadsApi.assign()` - Assign to user
- `leadsApi.getActivities()` - Get activities
- `leadsApi.getNotes()` - Get notes
- `leadsApi.getFollowUps()` - Get follow-ups
- `leadsApi.bulkAssign()` - Bulk assign leads
- `leadsApi.bulkUpdateStatus()` - Bulk update status
- `leadsApi.bulkDelete()` - Bulk delete leads

### Itineraries
- `itinerariesApi.list()` - List itineraries
- `itinerariesApi.create()` - Create itinerary
- `itinerariesApi.clone()` - Clone itinerary
- `itinerariesApi.createNewVersion()` - Create version
- `itinerariesApi.getVersions()` - Get versions
- `itinerariesApi.send()` - Send to contacts
- `itinerariesApi.createShareLink()` - Create share link

### Additional Domains
Refer to the exported API modules for complete methods:
- `invoicesApi` - Invoices & billing
- `paymentsApi` - Payment records
- `suppliersApi` - Supplier management
- `tasksApi` - Task management
- `eventsApi` - Calendar events
- `followUpsApi` - Follow-ups
- `documentsApi` - Document storage
- `vouchersApi` - Travel vouchers
- `visaApi` / `travellersApi` - Visa & traveller info
- `fleetApi` - Vehicle & driver management
- `communicationsApi` - Send messages
- `campaignsApi` - Marketing campaigns
- `aiApi` - AI features
- And more...

## Development Tips

1. **Type Safety**: Always use TypeScript strict mode. The API modules are fully typed.

2. **Error Boundaries**: Wrap API calls in try-catch or use hook error states.

3. **Cancellation**: Network requests include AbortController support for cancellation.

4. **Caching**: Use React Query or SWR for production caching (not included, but compatible).

5. **Testing**: All API methods are testable - mock the `client` module in tests.

6. **Loading States**: Always check the `loading` flag before rendering data.

7. **Dependency Arrays**: When using hooks, correctly specify dependencies to avoid infinite loops.
