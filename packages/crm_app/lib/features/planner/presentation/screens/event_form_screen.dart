import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/event.dart';
import '../providers/event_provider.dart';

/// Event creation and editing form.
class EventFormScreen extends ConsumerStatefulWidget {
  final String? eventId;
  final DateTime? initialDate;

  const EventFormScreen({super.key, this.eventId, this.initialDate});

  @override
  ConsumerState<EventFormScreen> createState() => _EventFormScreenState();
}

class _EventFormScreenState extends ConsumerState<EventFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _titleCtrl;
  late TextEditingController _descriptionCtrl;
  late TextEditingController _locationCtrl;

  EventType _eventType = EventType.meeting;
  DateTime _startDate = DateTime.now();
  TimeOfDay _startTime = TimeOfDay.now();
  DateTime? _endDate;
  TimeOfDay? _endTime;
  bool _allDay = false;
  bool _isRecurring = false;
  String _recurrenceFrequency = 'weekly';
  int _recurrenceInterval = 1;
  DateTime? _recurrenceEndDate;

  bool _isLoading = false;
  bool get _isEditing => widget.eventId != null;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController();
    _descriptionCtrl = TextEditingController();
    _locationCtrl = TextEditingController();

    if (widget.initialDate != null) {
      _startDate = widget.initialDate!;
    }

    if (_isEditing) {
      _loadEvent();
    }
  }

  Future<void> _loadEvent() async {
    setState(() => _isLoading = true);
    try {
      final event = await ref.read(eventRepositoryProvider).getEvent(widget.eventId!);
      _titleCtrl.text = event.title;
      _descriptionCtrl.text = event.description ?? '';
      _locationCtrl.text = event.location ?? '';
      _eventType = event.eventType;
      _startDate = DateTime.parse(event.startAt);
      _startTime = TimeOfDay.fromDateTime(_startDate);
      _allDay = event.allDay;
      if (event.endAt != null) {
        final end = DateTime.parse(event.endAt!);
        _endDate = end;
        _endTime = TimeOfDay.fromDateTime(end);
      }
      if (event.recurrenceRule != null) {
        _isRecurring = true;
        _recurrenceFrequency = event.recurrenceRule!['frequency'] ?? 'weekly';
        _recurrenceInterval = event.recurrenceRule!['interval'] ?? 1;
        if (event.recurrenceRule!['end_date'] != null) {
          _recurrenceEndDate = DateTime.tryParse(event.recurrenceRule!['end_date']);
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load event: $e')),
        );
      }
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Event' : 'New Event'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Event type selector
                  Text('Event Type', style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: EventType.values.map((type) {
                      final selected = _eventType == type;
                      return ChoiceChip(
                        avatar: Icon(type.icon, size: 16,
                            color: selected ? Colors.white : type.color),
                        label: Text(type.displayName),
                        selected: selected,
                        selectedColor: type.color,
                        labelStyle: TextStyle(
                          color: selected ? Colors.white : null,
                        ),
                        onSelected: (_) => setState(() => _eventType = type),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),

                  // Title
                  TextFormField(
                    controller: _titleCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Title *',
                      prefixIcon: Icon(Icons.title),
                    ),
                    validator: (v) => v?.isEmpty == true ? 'Title is required' : null,
                  ),
                  const SizedBox(height: 16),

                  // Description
                  TextFormField(
                    controller: _descriptionCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      prefixIcon: Icon(Icons.description),
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),

                  // Location
                  TextFormField(
                    controller: _locationCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Location',
                      prefixIcon: Icon(Icons.location_on),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // All day toggle
                  SwitchListTile(
                    title: const Text('All Day'),
                    value: _allDay,
                    onChanged: (v) => setState(() => _allDay = v),
                  ),
                  const SizedBox(height: 8),

                  // Start date/time
                  _buildDateTimePicker(
                    label: 'Start',
                    date: _startDate,
                    time: _allDay ? null : _startTime,
                    onDateChanged: (d) => setState(() => _startDate = d),
                    onTimeChanged: _allDay ? null : (t) => setState(() => _startTime = t),
                  ),
                  const SizedBox(height: 12),

                  // End date/time
                  _buildDateTimePicker(
                    label: 'End',
                    date: _endDate,
                    time: _allDay ? null : _endTime,
                    onDateChanged: (d) => setState(() => _endDate = d),
                    onTimeChanged: _allDay ? null : (t) => setState(() => _endTime = t),
                    isOptional: true,
                  ),
                  const SizedBox(height: 16),

                  // Recurrence
                  SwitchListTile(
                    title: const Text('Recurring'),
                    secondary: const Icon(Icons.repeat),
                    value: _isRecurring,
                    onChanged: (v) => setState(() => _isRecurring = v),
                  ),
                  if (_isRecurring) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Text('Every '),
                        SizedBox(
                          width: 60,
                          child: TextFormField(
                            initialValue: '$_recurrenceInterval',
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.center,
                            onChanged: (v) => _recurrenceInterval = int.tryParse(v) ?? 1,
                          ),
                        ),
                        const SizedBox(width: 8),
                        DropdownButton<String>(
                          value: _recurrenceFrequency,
                          items: const [
                            DropdownMenuItem(value: 'daily', child: Text('Day(s)')),
                            DropdownMenuItem(value: 'weekly', child: Text('Week(s)')),
                            DropdownMenuItem(value: 'monthly', child: Text('Month(s)')),
                          ],
                          onChanged: (v) => setState(() => _recurrenceFrequency = v ?? 'weekly'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ListTile(
                      title: Text(_recurrenceEndDate != null
                          ? 'Until: ${DateFormat('MMM d, yyyy').format(_recurrenceEndDate!)}'
                          : 'No end date'),
                      trailing: const Icon(Icons.calendar_today),
                      onTap: () async {
                        final date = await showDatePicker(
                          context: context,
                          initialDate: _recurrenceEndDate ?? DateTime.now().add(const Duration(days: 90)),
                          firstDate: DateTime.now(),
                          lastDate: DateTime(2030),
                        );
                        if (date != null) setState(() => _recurrenceEndDate = date);
                      },
                    ),
                  ],
                ],
              ),
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _isLoading ? null : _save,
            child: _isLoading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(_isEditing ? 'Update Event' : 'Create Event'),
          ),
        ),
      ),
    );
  }

  Widget _buildDateTimePicker({
    required String label,
    required DateTime? date,
    TimeOfDay? time,
    required ValueChanged<DateTime> onDateChanged,
    ValueChanged<TimeOfDay>? onTimeChanged,
    bool isOptional = false,
  }) {
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: InkWell(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
              );
              if (picked != null) onDateChanged(picked);
            },
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: '$label Date${isOptional ? ' (optional)' : ''}',
                prefixIcon: const Icon(Icons.calendar_today),
              ),
              child: Text(
                date != null ? DateFormat('MMM d, yyyy').format(date) : 'Select',
              ),
            ),
          ),
        ),
        if (onTimeChanged != null) ...[
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: InkWell(
              onTap: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: time ?? TimeOfDay.now(),
                );
                if (picked != null) onTimeChanged(picked);
              },
              child: InputDecorator(
                decoration: InputDecoration(
                  labelText: '$label Time',
                  prefixIcon: const Icon(Icons.access_time),
                ),
                child: Text(time?.format(context) ?? 'Select'),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final startAt = _allDay
          ? DateTime(_startDate.year, _startDate.month, _startDate.day)
          : DateTime(_startDate.year, _startDate.month, _startDate.day, _startTime.hour, _startTime.minute);

      DateTime? endAt;
      if (_endDate != null) {
        endAt = _allDay
            ? DateTime(_endDate!.year, _endDate!.month, _endDate!.day, 23, 59)
            : DateTime(_endDate!.year, _endDate!.month, _endDate!.day,
                _endTime?.hour ?? 23, _endTime?.minute ?? 59);
      }

      final body = <String, dynamic>{
        'title': _titleCtrl.text.trim(),
        'event_type': _eventType.name == 'tripDeparture' ? 'trip_departure'
            : _eventType.name == 'tripReturn' ? 'trip_return'
            : _eventType.name == 'followUp' ? 'follow_up'
            : _eventType.name,
        'start_at': startAt.toIso8601String(),
        if (endAt != null) 'end_at': endAt.toIso8601String(),
        'all_day': _allDay,
        'description': _descriptionCtrl.text.trim().isEmpty ? null : _descriptionCtrl.text.trim(),
        'location': _locationCtrl.text.trim().isEmpty ? null : _locationCtrl.text.trim(),
        'color': _eventType.color.toARGB32().toRadixString(16),
      };

      if (_isRecurring) {
        body['recurrence_rule'] = {
          'frequency': _recurrenceFrequency,
          'interval': _recurrenceInterval,
          if (_recurrenceEndDate != null) 'end_date': _recurrenceEndDate!.toIso8601String(),
        };
      }

      final repo = ref.read(eventRepositoryProvider);
      if (_isEditing) {
        await repo.updateEvent(widget.eventId!, body);
      } else {
        await repo.createEvent(body);
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isEditing ? 'Event updated' : 'Event created')),
      );
      context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
    if (mounted) setState(() => _isLoading = false);
  }
}
