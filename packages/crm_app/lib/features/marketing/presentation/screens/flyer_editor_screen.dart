import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/providers/marketing_providers.dart';
import '../widgets/flyer_canvas.dart';
import '../widgets/element_properties_panel.dart';
import '../widgets/size_preset_selector.dart';

/// Canvas element representation for the flyer editor.
class CanvasElement {
  String id;
  String type; // text, image, shape
  double x;
  double y;
  double width;
  double height;
  double rotation;
  Map<String, dynamic> properties;

  CanvasElement({
    required this.id,
    required this.type,
    this.x = 0,
    this.y = 0,
    this.width = 200,
    this.height = 100,
    this.rotation = 0,
    Map<String, dynamic>? properties,
  }) : properties = properties ?? {};

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'x': x,
    'y': y,
    'width': width,
    'height': height,
    'rotation': rotation,
    'properties': properties,
  };

  factory CanvasElement.fromJson(Map<String, dynamic> json) => CanvasElement(
    id: json['id'],
    type: json['type'],
    x: (json['x'] as num).toDouble(),
    y: (json['y'] as num).toDouble(),
    width: (json['width'] as num).toDouble(),
    height: (json['height'] as num).toDouble(),
    rotation: (json['rotation'] as num?)?.toDouble() ?? 0,
    properties: Map<String, dynamic>.from(json['properties'] ?? {}),
  );
}

class FlyerEditorScreen extends ConsumerStatefulWidget {
  final String? templateId;
  final String? draftId;

  const FlyerEditorScreen({super.key, this.templateId, this.draftId});

  @override
  ConsumerState<FlyerEditorScreen> createState() => _FlyerEditorScreenState();
}

class _FlyerEditorScreenState extends ConsumerState<FlyerEditorScreen> {
  final GlobalKey _canvasKey = GlobalKey();
  final List<CanvasElement> _elements = [];
  final List<List<Map<String, dynamic>>> _undoStack = [];
  final List<List<Map<String, dynamic>>> _redoStack = [];
  String? _selectedElementId;
  bool _isLoading = true;
  bool _isSaving = false;
  String _flyerName = 'Untitled Flyer';

  // Canvas dimensions
  int _canvasWidth = 1080;
  int _canvasHeight = 1080;
  String _sizePreset = 'instagram_post';

  static const _sizePresets = {
    'instagram_post': (1080, 1080),
    'instagram_story': (1080, 1920),
    'facebook_cover': (820, 312),
    'whatsapp_status': (1080, 1920),
  };

  @override
  void initState() {
    super.initState();
    _loadInitialState();
  }

  Future<void> _loadInitialState() async {
    if (widget.templateId != null) {
      try {
        final repo = ref.read(flyerTemplateRepositoryProvider);
        final template = await repo.getTemplate(widget.templateId!);
        _flyerName = template.name;
        _canvasWidth = template.width;
        _canvasHeight = template.height;
        _sizePreset = template.sizePreset;

        if (template.layoutJson != null) {
          final layout = jsonDecode(template.layoutJson!);
          if (layout['elements'] is List) {
            for (final e in layout['elements']) {
              _elements.add(CanvasElement.fromJson(e));
            }
          }
        }
      } catch (_) {}
    } else if (widget.draftId != null) {
      try {
        final repo = ref.read(flyerRepositoryProvider);
        final flyer = await repo.getFlyer(widget.draftId!);
        _flyerName = flyer.name;
        _canvasWidth = flyer.width ?? 1080;
        _canvasHeight = flyer.height ?? 1080;

        if (flyer.layoutJson != null) {
          final layout = jsonDecode(flyer.layoutJson!);
          if (layout['elements'] is List) {
            for (final e in layout['elements']) {
              _elements.add(CanvasElement.fromJson(e));
            }
          }
        }
      } catch (_) {}
    }

    setState(() => _isLoading = false);
  }

  void _pushUndoState() {
    _undoStack.add(_elements.map((e) => e.toJson()).toList());
    _redoStack.clear();
    // Keep max 20 undo states
    if (_undoStack.length > 20) _undoStack.removeAt(0);
  }

  void _undo() {
    if (_undoStack.isEmpty) return;
    _redoStack.add(_elements.map((e) => e.toJson()).toList());
    final prev = _undoStack.removeLast();
    setState(() {
      _elements.clear();
      _elements.addAll(prev.map((e) => CanvasElement.fromJson(e)));
      _selectedElementId = null;
    });
  }

  void _redo() {
    if (_redoStack.isEmpty) return;
    _undoStack.add(_elements.map((e) => e.toJson()).toList());
    final next = _redoStack.removeLast();
    setState(() {
      _elements.clear();
      _elements.addAll(next.map((e) => CanvasElement.fromJson(e)));
      _selectedElementId = null;
    });
  }

  void _addTextElement() {
    _pushUndoState();
    setState(() {
      _elements.add(
        CanvasElement(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          type: 'text',
          x: 100,
          y: 100,
          width: 300,
          height: 60,
          properties: {
            'text': 'Double click to edit',
            'fontSize': 24,
            'fontWeight': 'bold',
            'color': '#000000',
            'fontFamily': 'Roboto',
            'textAlign': 'center',
          },
        ),
      );
    });
  }

  void _addShapeElement(String shape) {
    _pushUndoState();
    setState(() {
      _elements.add(
        CanvasElement(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          type: 'shape',
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          properties: {
            'shape': shape,
            'fillColor': '#E3F2FD',
            'borderColor': '#1976D2',
            'borderWidth': 2,
          },
        ),
      );
    });
  }

  void _addImagePlaceholder() {
    _pushUndoState();
    setState(() {
      _elements.add(
        CanvasElement(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          type: 'image',
          x: 100,
          y: 100,
          width: 300,
          height: 200,
          properties: {'url': '', 'fit': 'cover'},
        ),
      );
    });
  }

  void _deleteSelected() {
    if (_selectedElementId == null) return;
    _pushUndoState();
    setState(() {
      _elements.removeWhere((e) => e.id == _selectedElementId);
      _selectedElementId = null;
    });
  }

  void _onSizePresetChanged(String preset) {
    final dims = _sizePresets[preset];
    if (dims != null) {
      setState(() {
        _sizePreset = preset;
        _canvasWidth = dims.$1;
        _canvasHeight = dims.$2;
      });
    }
  }

  Future<void> _saveFlyer() async {
    setState(() => _isSaving = true);
    try {
      final layoutJson = jsonEncode({
        'elements': _elements.map((e) => e.toJson()).toList(),
        'width': _canvasWidth,
        'height': _canvasHeight,
      });

      final repo = ref.read(flyerRepositoryProvider);
      await repo.saveFlyer({
        'templateId': widget.templateId,
        'name': _flyerName,
        'layoutJson': layoutJson,
        'width': _canvasWidth,
        'height': _canvasHeight,
      });

      ref.read(flyerListProvider.notifier).loadFlyers(refresh: true);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Flyer saved!')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Error saving: $e')));
    }
    if (mounted) setState(() => _isSaving = false);
  }

  CanvasElement? get _selectedElement {
    if (_selectedElementId == null) return null;
    return _elements.cast<CanvasElement?>().firstWhere(
      (e) => e?.id == _selectedElementId,
      orElse: () => null,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      body: Column(
        children: [
          // Toolbar
          _buildToolbar(context),

          // Main content
          Expanded(
            child: Row(
              children: [
                // Canvas area
                Expanded(
                  flex: 3,
                  child: Container(
                    color: Colors.grey[300],
                    child: InteractiveViewer(
                      minScale: 0.25,
                      maxScale: 3.0,
                      child: Center(
                        child: RepaintBoundary(
                          key: _canvasKey,
                          child: FlyerCanvas(
                            width: _canvasWidth.toDouble(),
                            height: _canvasHeight.toDouble(),
                            elements: _elements,
                            selectedElementId: _selectedElementId,
                            onElementSelected: (id) {
                              setState(() => _selectedElementId = id);
                            },
                            onElementMoved: (id, dx, dy) {
                              _pushUndoState();
                              setState(() {
                                final el = _elements.firstWhere(
                                  (e) => e.id == id,
                                );
                                el.x += dx;
                                el.y += dy;
                              });
                            },
                            onElementResized: (id, width, height) {
                              _pushUndoState();
                              setState(() {
                                final el = _elements.firstWhere(
                                  (e) => e.id == id,
                                );
                                el.width = width;
                                el.height = height;
                              });
                            },
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                // Properties panel
                if (_selectedElement != null)
                  SizedBox(
                    width: 280,
                    child: ElementPropertiesPanel(
                      element: _selectedElement!,
                      onPropertyChanged: (key, value) {
                        _pushUndoState();
                        setState(() {
                          _selectedElement!.properties[key] = value;
                        });
                      },
                      onDelete: _deleteSelected,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToolbar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: [
          // Back
          IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/marketing/my-flyers'),
            tooltip: 'Back',
          ),
          const SizedBox(width: 8),

          // Flyer name
          SizedBox(
            width: 200,
            child: TextField(
              controller: TextEditingController(text: _flyerName),
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                isDense: true,
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 8,
                ),
              ),
              onChanged: (v) => _flyerName = v,
            ),
          ),
          const SizedBox(width: 16),

          // Size Preset
          SizePresetSelector(
            value: _sizePreset,
            onChanged: _onSizePresetChanged,
          ),

          const Spacer(),

          // Add elements
          IconButton(
            icon: const Icon(Icons.text_fields),
            onPressed: _addTextElement,
            tooltip: 'Add Text',
          ),
          IconButton(
            icon: const Icon(Icons.image),
            onPressed: _addImagePlaceholder,
            tooltip: 'Add Image',
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.category),
            tooltip: 'Add Shape',
            onSelected: _addShapeElement,
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'rectangle', child: Text('Rectangle')),
              const PopupMenuItem(value: 'circle', child: Text('Circle')),
              const PopupMenuItem(value: 'line', child: Text('Line')),
            ],
          ),

          const SizedBox(width: 16),

          // Undo/Redo
          IconButton(
            icon: const Icon(Icons.undo),
            onPressed: _undoStack.isNotEmpty ? _undo : null,
            tooltip: 'Undo',
          ),
          IconButton(
            icon: const Icon(Icons.redo),
            onPressed: _redoStack.isNotEmpty ? _redo : null,
            tooltip: 'Redo',
          ),
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: _selectedElementId != null ? _deleteSelected : null,
            tooltip: 'Delete Selected',
          ),

          const SizedBox(width: 16),

          // Save
          ElevatedButton.icon(
            onPressed: _isSaving ? null : _saveFlyer,
            icon: _isSaving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save),
            label: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
