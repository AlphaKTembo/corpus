import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:corpus_mobile/services/api_client.dart';
import 'package:corpus_mobile/theme/app_theme.dart';

class FitnessSyncerScreen extends StatefulWidget {
  const FitnessSyncerScreen({super.key});

  @override
  State<FitnessSyncerScreen> createState() => _FitnessSyncerScreenState();
}

class _FitnessSyncerScreenState extends State<FitnessSyncerScreen> {
  final _apiClient = ApiClient();
  String? _authUrl;
  bool _isConnected = false;
  bool _loading = true;
  bool _syncing = false;
  String _syncStatus = '';
  bool _showManualCode = false;
  final _codeController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _checkConnection();
    _getAuthUrl();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _checkConnection() async {
    try {
      final response = await _apiClient.getFitnessSyncerStatus();
      setState(() {
        _isConnected = response['connected'] ?? false;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _isConnected = false;
        _loading = false;
      });
    }
  }

  Future<void> _getAuthUrl() async {
    try {
      final response = await _apiClient.getFitnessSyncerAuthUrl();
      setState(() {
        if (response['authUrl'] != null) {
          _authUrl = response['authUrl'];
          _syncStatus = ''; // Clear any previous errors
        } else if (response['error'] != null) {
          _authUrl = null;
          _syncStatus = 'Error: ${response['error']}';
        } else {
          _authUrl = null;
          _syncStatus = 'Unable to get authorization URL';
        }
      });
    } catch (e) {
      setState(() {
        _authUrl = null;
        // Show more helpful error message
        final errorMsg = e.toString();
        if (errorMsg.contains('Failed host lookup') ||
            errorMsg.contains('Connection refused') ||
            errorMsg.contains('Network is unreachable')) {
          _syncStatus =
              'Cannot connect to API. Make sure the API is running and accessible. For Android emulator, use API_BASE_URL=http://10.0.2.2:3000';
        } else {
          _syncStatus = 'Error: $errorMsg';
        }
      });
    }
  }

  Future<void> _handleConnect() async {
    if (_authUrl != null) {
      final uri = Uri.parse(_authUrl!);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        setState(() {
          _showManualCode = true;
          _syncStatus =
              'After authorizing, copy the code from the redirect URL and paste it below';
        });
      } else {
        setState(() {
          _syncStatus = 'Could not open authorization URL';
        });
      }
    }
  }

  Future<void> _handleManualCodeSubmit() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      setState(() {
        _syncStatus = 'Please enter a code';
      });
      return;
    }

    // Extract code from URL if user pasted the full URL
    String extractedCode = code;
    if (code.contains('code=')) {
      final uri = Uri.tryParse(code);
      if (uri != null) {
        extractedCode = uri.queryParameters['code'] ?? code;
      }
    }

    setState(() {
      _loading = true;
      _syncStatus = 'Connecting...';
    });

    try {
      await _apiClient.connectFitnessSyncer(extractedCode);
      setState(() {
        _isConnected = true;
        _syncStatus = 'Successfully connected!';
        _showManualCode = false;
        _codeController.clear();
      });
      await _checkConnection();
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) {
          setState(() {
            _syncStatus = '';
          });
        }
      });
    } catch (e) {
      setState(() {
        _syncStatus = 'Connection failed: ${e.toString()}';
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  Future<void> _handleSync() async {
    setState(() {
      _syncing = true;
      _syncStatus = 'Syncing...';
    });

    try {
      final response = await _apiClient.triggerFitnessSyncerSync();
      setState(() {
        _syncStatus = response['message'] ?? 'Sync triggered successfully!';
      });
    } catch (e) {
      setState(() {
        _syncStatus = 'Sync failed: ${e.toString()}';
      });
    } finally {
      setState(() {
        _syncing = false;
      });
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) {
          setState(() {
            _syncStatus = '';
          });
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && !_showManualCode) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FitnessSyncer',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
                letterSpacing: -1,
              ),
            ),
            const SizedBox(height: 24),
            Container(
              decoration: BoxDecoration(
                color: AppTheme.surfaceColor,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 20,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Connect Your FitnessSyncer Account',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'FitnessSyncer aggregates data from 100+ fitness apps and devices. Connect your account to automatically sync activities, vitals, sleep, and body metrics into Corpus.',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (!_isConnected) ...[
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _authUrl != null ? _handleConnect : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: const Text(
                          'Connect FitnessSyncer Account',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    if (_authUrl == null &&
                        _syncStatus.isEmpty &&
                        !_loading) ...[
                      const SizedBox(height: 8),
                      Text(
                        'FitnessSyncer credentials not configured.',
                        style: TextStyle(
                          color: Colors.grey[600],
                          fontSize: 12,
                        ),
                      ),
                    ],
                    if (_showManualCode) ...[
                      const SizedBox(height: 24),
                      TextField(
                        controller: _codeController,
                        decoration: const InputDecoration(
                          labelText: 'Authorization Code or URL',
                          hintText: 'Paste the code or full redirect URL',
                          border: OutlineInputBorder(),
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton(
                              onPressed: _handleManualCodeSubmit,
                              child: const Text('Connect'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                _showManualCode = false;
                                _codeController.clear();
                              });
                            },
                            child: const Text('Cancel'),
                          ),
                        ],
                      ),
                    ],
                  ] else ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            AppTheme.successColor.withOpacity(0.1),
                            AppTheme.successColor.withOpacity(0.05),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: AppTheme.successColor.withOpacity(0.2),
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: AppTheme.successColor.withOpacity(0.2),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.check_circle,
                              color: AppTheme.successColor,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 12),
                          const Text(
                            'Connected',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: AppTheme.successColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _syncing ? null : _handleSync,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: _syncing
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white),
                                ),
                              )
                            : const Text(
                                'Sync Now',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ],
                  if (_syncStatus.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: _syncStatus.toLowerCase().contains('failed') ||
                                _syncStatus.toLowerCase().contains('error')
                            ? AppTheme.errorColor.withOpacity(0.1)
                            : AppTheme.successColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color:
                              (_syncStatus.toLowerCase().contains('failed') ||
                                          _syncStatus
                                              .toLowerCase()
                                              .contains('error')
                                      ? AppTheme.errorColor
                                      : AppTheme.successColor)
                                  .withOpacity(0.2),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _syncStatus.toLowerCase().contains('failed') ||
                                    _syncStatus.toLowerCase().contains('error')
                                ? Icons.error_outline
                                : Icons.check_circle_outline,
                            color: _syncStatus
                                        .toLowerCase()
                                        .contains('failed') ||
                                    _syncStatus.toLowerCase().contains('error')
                                ? AppTheme.errorColor
                                : AppTheme.successColor,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _syncStatus,
                              style: TextStyle(
                                color: _syncStatus
                                            .toLowerCase()
                                            .contains('failed') ||
                                        _syncStatus
                                            .toLowerCase()
                                            .contains('error')
                                    ? AppTheme.errorColor
                                    : AppTheme.successColor,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              decoration: BoxDecoration(
                color: AppTheme.surfaceColor,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 20,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'What Gets Synced',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildSyncItem('Activities', 'Workouts, runs, rides, etc.'),
                  _buildSyncItem('Vitals', 'HRV, resting heart rate'),
                  _buildSyncItem('Sleep', 'Sleep duration, REM, deep sleep'),
                  _buildSyncItem('Body Metrics', 'Weight, body fat percentage'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSyncItem(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              description,
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
