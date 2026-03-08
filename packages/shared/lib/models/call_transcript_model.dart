import 'package:freezed_annotation/freezed_annotation.dart';

part 'call_transcript_model.freezed.dart';
part 'call_transcript_model.g.dart';

@freezed
abstract class CallTranscriptModel with _$CallTranscriptModel {
  const factory CallTranscriptModel({
    required String id,
    required String callLogId,
    required String fullTranscript,
    List<SpeakerSegment>? speakerSegments,
    String? language,
    double? confidence,
    int? wordCount,
    int? durationSeconds,
    String? transcriptionModel,
    @Default(false) bool isEdited,
    String? editedBy,
    String? editedByName,
    String? editedAt,
    String? createdAt,
  }) = _CallTranscriptModel;

  factory CallTranscriptModel.fromJson(Map<String, dynamic> json) =>
      _$CallTranscriptModelFromJson(json);
}

@freezed
abstract class SpeakerSegment with _$SpeakerSegment {
  const factory SpeakerSegment({
    required int speaker,
    required String text,
    double? start,
    double? end,
    double? confidence,
  }) = _SpeakerSegment;

  factory SpeakerSegment.fromJson(Map<String, dynamic> json) =>
      _$SpeakerSegmentFromJson(json);
}

@freezed
abstract class TranscriptSearchResult with _$TranscriptSearchResult {
  const factory TranscriptSearchResult({
    required String id,
    required String callLogId,
    String? snippet,
    String? language,
    double? confidence,
    int? wordCount,
    int? durationSeconds,
    String? direction,
    String? fromNumber,
    String? toNumber,
    String? callStatus,
    String? contactName,
    String? createdAt,
  }) = _TranscriptSearchResult;

  factory TranscriptSearchResult.fromJson(Map<String, dynamic> json) =>
      _$TranscriptSearchResultFromJson(json);
}
