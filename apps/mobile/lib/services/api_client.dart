import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  // For iOS Simulator: use localhost
  // For Android Emulator: use 10.0.2.2 (maps to host machine's localhost)
  // For physical device: use your machine's IP address (e.g., http://192.168.1.100:3000)
  // For Chrome/Web: use localhost
  static String get baseUrl {
    const envUrl = String.fromEnvironment('API_BASE_URL');
    if (envUrl.isNotEmpty) {
      return envUrl;
    }
    // Default: try to detect platform and use appropriate URL
    // For now, default to localhost (works for iOS Simulator and Chrome)
    // For Android Emulator, pass API_BASE_URL=http://10.0.2.2:3000
    return 'http://localhost:3000';
  }

  Future<Map<String, String>> _getHeaders() async {
    return <String, String>{
      'Content-Type': 'application/json',
    };
  }

  Future<http.Response> _get(String endpoint) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl$endpoint'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception(
          'API request failed: ${response.statusCode} - ${response.body}');
    }

    return response;
  }

  Future<Map<String, dynamic>> getTodayBrief() async {
    final response = await _get('/v1/summary/today');
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getActivities({
    String? from,
    String? to,
    String? sport,
    int? limit,
  }) async {
    final queryParams = <String, String>{};
    if (from != null) queryParams['from'] = from;
    if (to != null) queryParams['to'] = to;
    if (sport != null) queryParams['sport'] = sport;
    if (limit != null) queryParams['limit'] = limit.toString();

    final uri = Uri.parse('$baseUrl/v1/activities')
        .replace(queryParameters: queryParams);
    final headers = await _getHeaders();
    final response = await http.get(uri, headers: headers);

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['activities'] ?? [];
    }
    throw Exception(
        'API request failed: ${response.statusCode} - ${response.body}');
  }

  Future<Map<String, dynamic>> getActivity(String id) async {
    final response = await _get('/v1/activities/$id');
    return jsonDecode(response.body);
  }

  // FitnessSyncer endpoints
  Future<Map<String, dynamic>> getFitnessSyncerAuthUrl() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/v1/fitnesssyncer/authorize'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception(
          'API request failed: ${response.statusCode} - ${response.body}');
    }

    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getFitnessSyncerStatus() async {
    final response = await _get('/v1/fitnesssyncer/status');
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> triggerFitnessSyncerSync() async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$baseUrl/v1/fitnesssyncer/sync'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception(
          'API request failed: ${response.statusCode} - ${response.body}');
    }

    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> connectFitnessSyncer(String code) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$baseUrl/v1/fitnesssyncer/callback'),
      headers: headers,
      body: jsonEncode({'code': code}),
    );

    if (response.statusCode != 200) {
      final errorData = jsonDecode(response.body);
      throw Exception(errorData['error_description'] ??
          errorData['error'] ??
          'Connection failed');
    }

    return jsonDecode(response.body);
  }

  // Metrics endpoints
  Future<List<dynamic>> getVitals({String? from, String? to}) async {
    final queryParams = <String, String>{};
    if (from != null) queryParams['from'] = from;
    if (to != null) queryParams['to'] = to;

    final uri = Uri.parse('$baseUrl/v1/metrics/vitals')
        .replace(queryParameters: queryParams);
    final headers = await _getHeaders();
    final response = await http.get(uri, headers: headers);

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data is List ? data : [];
    }
    throw Exception(
        'API request failed: ${response.statusCode} - ${response.body}');
  }

  Future<List<dynamic>> getSleep({String? from, String? to}) async {
    final queryParams = <String, String>{};
    if (from != null) queryParams['from'] = from;
    if (to != null) queryParams['to'] = to;

    final uri = Uri.parse('$baseUrl/v1/metrics/sleep')
        .replace(queryParameters: queryParams);
    final headers = await _getHeaders();
    final response = await http.get(uri, headers: headers);

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data is List ? data : [];
    }
    throw Exception(
        'API request failed: ${response.statusCode} - ${response.body}');
  }

  Future<List<dynamic>> getBodyMetrics({String? from, String? to}) async {
    final queryParams = <String, String>{};
    if (from != null) queryParams['from'] = from;
    if (to != null) queryParams['to'] = to;

    final uri = Uri.parse('$baseUrl/v1/metrics/body')
        .replace(queryParameters: queryParams);
    final headers = await _getHeaders();
    final response = await http.get(uri, headers: headers);

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data is List ? data : [];
    }
    throw Exception(
        'API request failed: ${response.statusCode} - ${response.body}');
  }
}
