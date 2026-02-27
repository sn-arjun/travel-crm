
import 'contact_model.dart';

class PaginatedResponse<T> {
  final List<T> data;
  final PaginationMeta? pagination;

  const PaginatedResponse({required this.data, this.pagination});

  factory PaginatedResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) fromJsonT,
  ) {
    final dataList = (json['data'] as List? ?? [])
        .map((e) => fromJsonT(e as Map<String, dynamic>))
        .toList();
    
    final paginationJson = json['pagination'];
    
    return PaginatedResponse(
      data: dataList,
      pagination: paginationJson != null
          ? PaginationMeta.fromJson(paginationJson as Map<String, dynamic>)
          : null,
    );
  }
}
