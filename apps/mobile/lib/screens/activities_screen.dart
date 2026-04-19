import 'package:flutter/material.dart';
import 'package:corpus_mobile/services/api_client.dart';
import 'package:intl/intl.dart';
import 'package:corpus_mobile/theme/app_theme.dart';

class ActivitiesScreen extends StatefulWidget {
  const ActivitiesScreen({super.key});

  @override
  State<ActivitiesScreen> createState() => _ActivitiesScreenState();
}

class _ActivitiesScreenState extends State<ActivitiesScreen> {
  final _apiClient = ApiClient();
  List<dynamic> _activities = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadActivities();
  }

  Future<void> _loadActivities() async {
    try {
      final activities = await _apiClient.getActivities(limit: 50);
      setState(() {
        _activities = activities;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _activities.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _loadActivities,
                  child: CustomScrollView(
                    slivers: [
                      SliverAppBar(
                        expandedHeight: 100,
                        floating: false,
                        pinned: true,
                        backgroundColor: AppTheme.backgroundColor,
                        flexibleSpace: const FlexibleSpaceBar(
                          titlePadding: EdgeInsets.only(left: 20, bottom: 16),
                          title: Text(
                            'Activities',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary,
                              letterSpacing: -1,
                            ),
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.all(16),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (context, index) {
                              final activity = _activities[index];
                              return _buildActivityCard(activity);
                            },
                            childCount: _activities.length,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.directions_run_outlined,
              size: 40,
              color: Colors.grey.shade400,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No activities found',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityCard(Map<String, dynamic> activity) {
    final sport = activity['sport'] ?? 'Unknown';
    final startTime = activity['start_time_utc'];
    final duration = activity['duration_s'];
    final sportIcon = _getSportIcon(sport);
    final sportColor = _getSportColor(sport);

    DateTime? dateTime;
    if (startTime != null) {
      try {
        dateTime = DateTime.parse(startTime);
      } catch (e) {
        // Ignore
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppTheme.surfaceColor,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () {
            // Navigate to activity detail
          },
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: sportColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(sportIcon, color: sportColor, size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        sport,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      if (dateTime != null)
                        Text(
                          DateFormat('MMM dd, yyyy • hh:mm a')
                              .format(dateTime.toLocal()),
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey.shade600,
                          ),
                        ),
                    ],
                  ),
                ),
                if (duration != null)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _formatDuration(duration),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  IconData _getSportIcon(String sport) {
    final lowerSport = sport.toLowerCase();
    if (lowerSport.contains('run')) return Icons.directions_run;
    if (lowerSport.contains('bike') || lowerSport.contains('cycle'))
      return Icons.directions_bike;
    if (lowerSport.contains('swim')) return Icons.pool;
    if (lowerSport.contains('walk')) return Icons.directions_walk;
    return Icons.fitness_center;
  }

  Color _getSportColor(String sport) {
    final lowerSport = sport.toLowerCase();
    if (lowerSport.contains('run')) return AppTheme.errorColor;
    if (lowerSport.contains('bike') || lowerSport.contains('cycle'))
      return AppTheme.accentColor;
    if (lowerSport.contains('swim')) return Colors.blue;
    return AppTheme.primaryColor;
  }

  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m';
  }
}
