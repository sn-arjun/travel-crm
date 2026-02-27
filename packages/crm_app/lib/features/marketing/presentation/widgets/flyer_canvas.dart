import 'package:flutter/material.dart';
import '../screens/flyer_editor_screen.dart';

/// The main canvas rendering widget for the flyer editor.
/// Renders all elements on a white background at the specified dimensions.
class FlyerCanvas extends StatelessWidget {
  final double width;
  final double height;
  final List<CanvasElement> elements;
  final String? selectedElementId;
  final ValueChanged<String?> onElementSelected;
  final void Function(String id, double dx, double dy) onElementMoved;
  final void Function(String id, double width, double height) onElementResized;

  const FlyerCanvas({
    super.key,
    required this.width,
    required this.height,
    required this.elements,
    required this.selectedElementId,
    required this.onElementSelected,
    required this.onElementMoved,
    required this.onElementResized,
  });

  @override
  Widget build(BuildContext context) {
    // Scale the canvas to fit within a reasonable viewport
    final scale = 0.5;
    final displayWidth = width * scale;
    final displayHeight = height * scale;

    return GestureDetector(
      onTap: () => onElementSelected(null),
      child: Container(
        width: displayWidth,
        height: displayHeight,
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Stack(
          children: elements.map((element) {
            final isSelected = element.id == selectedElementId;
            return Positioned(
              left: element.x * scale,
              top: element.y * scale,
              child: GestureDetector(
                onTap: () => onElementSelected(element.id),
                onPanUpdate: (details) {
                  onElementMoved(
                    element.id,
                    details.delta.dx / scale,
                    details.delta.dy / scale,
                  );
                },
                child: Container(
                  width: element.width * scale,
                  height: element.height * scale,
                  decoration: isSelected
                      ? BoxDecoration(
                          border: Border.all(color: Colors.blue, width: 2),
                        )
                      : null,
                  child: Stack(
                    children: [
                      // Element content
                      Positioned.fill(child: _buildElement(element, scale)),
                      // Resize handle
                      if (isSelected)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: GestureDetector(
                            onPanUpdate: (details) {
                              onElementResized(
                                element.id,
                                (element.width + details.delta.dx / scale)
                                    .clamp(20, width),
                                (element.height + details.delta.dy / scale)
                                    .clamp(20, height),
                              );
                            },
                            child: Container(
                              width: 12,
                              height: 12,
                              decoration: BoxDecoration(
                                color: Colors.blue,
                                border: Border.all(
                                  color: Colors.white,
                                  width: 1,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildElement(CanvasElement element, double scale) {
    switch (element.type) {
      case 'text':
        return _buildTextElement(element, scale);
      case 'image':
        return _buildImageElement(element, scale);
      case 'shape':
        return _buildShapeElement(element, scale);
      default:
        return const SizedBox();
    }
  }

  Widget _buildTextElement(CanvasElement element, double scale) {
    final text = element.properties['text'] ?? 'Text';
    final fontSize = (element.properties['fontSize'] ?? 24) as num;
    final colorHex = element.properties['color'] ?? '#000000';
    final fontWeight = element.properties['fontWeight'] == 'bold'
        ? FontWeight.bold
        : FontWeight.normal;
    final textAlign = element.properties['textAlign'] == 'center'
        ? TextAlign.center
        : element.properties['textAlign'] == 'right'
        ? TextAlign.right
        : TextAlign.left;

    return Center(
      child: Text(
        text,
        textAlign: textAlign,
        style: TextStyle(
          fontSize: fontSize.toDouble() * scale,
          fontWeight: fontWeight,
          color: _parseColor(colorHex),
        ),
      ),
    );
  }

  Widget _buildImageElement(CanvasElement element, double scale) {
    final url = element.properties['url'] ?? '';
    if (url.isEmpty) {
      return Container(
        color: Colors.grey[200],
        child: Center(
          child: Icon(Icons.image, color: Colors.grey[400], size: 32 * scale),
        ),
      );
    }
    return Image.network(
      url,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => Container(
        color: Colors.grey[200],
        child: const Icon(Icons.broken_image),
      ),
    );
  }

  Widget _buildShapeElement(CanvasElement element, double scale) {
    final shape = element.properties['shape'] ?? 'rectangle';
    final fillHex = element.properties['fillColor'] ?? '#E3F2FD';
    final borderHex = element.properties['borderColor'] ?? '#1976D2';
    final borderWidth = (element.properties['borderWidth'] ?? 2) as num;

    if (shape == 'circle') {
      return Container(
        decoration: BoxDecoration(
          color: _parseColor(fillHex),
          shape: BoxShape.circle,
          border: Border.all(
            color: _parseColor(borderHex),
            width: borderWidth.toDouble(),
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: _parseColor(fillHex),
        border: Border.all(
          color: _parseColor(borderHex),
          width: borderWidth.toDouble(),
        ),
        borderRadius: shape == 'rounded'
            ? BorderRadius.circular(12 * scale)
            : null,
      ),
    );
  }

  Color _parseColor(String hex) {
    try {
      return Color(int.parse(hex.replaceFirst('#', '0xFF')));
    } catch (_) {
      return Colors.grey;
    }
  }
}
