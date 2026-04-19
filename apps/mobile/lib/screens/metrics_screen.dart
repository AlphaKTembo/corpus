import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:corpus_mobile/services/api_client.dart';
import 'package:intl/intl.dart';
import 'package:corpus_mobile/theme/app_theme.dart';

class MetricsScreen extends StatefulWidget {
  const MetricsScreen({super.key});

  @override
  State<MetricsScreen> createState() => _MetricsScreenState();
}

class _MetricsScreenState extends State<MetricsScreen>
    with SingleTickerProviderStateMixin {
  final _apiClient = ApiClient();
  List<dynamic> _vitals = [];
  List<dynamic> _sleep = [];
  List<dynamic> _bodyMetrics = [];
  bool _loading = true;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      final thirtyDaysAgo = DateTime.now().subtract(const Duration(days: 30));
      final from = DateFormat('yyyy-MM-dd').format(thirtyDaysAgo);

      final results = await Future.wait([
        _apiClient.getVitals(from: from),
        _apiClient.getSleep(from: from),
        _apiClient.getBodyMetrics(from: from),
      ]);

      setState(() {
        _vitals = results[0];
        _sleep = results[1];
        _bodyMetrics = results[2];
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
      appBar: AppBar(
        title: const Text('Metrics'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: BorderRadius.circular(16),
            ),
            child: TabBar(
              controller: _tabController,
              indicator: BoxDecoration(
                color: AppTheme.primaryColor,
                borderRadius: BorderRadius.circular(16),
              ),
              labelColor: Colors.white,
              unselectedLabelColor: Colors.grey.shade600,
              labelStyle: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
              tabs: const [
                Tab(text: 'Vitals'),
                Tab(text: 'Sleep'),
                Tab(text: 'Body'),
              ],
            ),
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildVitalsTab(),
                _buildSleepTab(),
                _buildBodyTab(),
              ],
            ),
    );
  }

  Widget _buildVitalsTab() {
    if (_vitals.isEmpty) {
      return _buildEmptyState(
          'No vitals data available', Icons.favorite_outline);
    }

    // Prepare data for chart (reverse to show oldest first)
    final chartData = _vitals.reversed.toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 300,
            child: LineChart(
              LineChartData(
                gridData: const FlGridData(show: true),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: true),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        if (value.toInt() >= 0 &&
                            value.toInt() < chartData.length) {
                          final date = chartData[value.toInt()]['date'];
                          if (date != null) {
                            try {
                              final dateTime = DateTime.parse(date);
                              return Text(
                                DateFormat('MM/dd').format(dateTime),
                                style: const TextStyle(fontSize: 10),
                              );
                            } catch (e) {
                              return const Text('');
                            }
                          }
                        }
                        return const Text('');
                      },
                    ),
                  ),
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                ),
                borderData: FlBorderData(show: true),
                lineBarsData: [
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['resting_hr_bpm'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.red,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['hrv_ms'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.black,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildLegendItem('Resting HR (bpm)', Colors.red),
          const SizedBox(height: 8),
          _buildLegendItem('HRV (ms)', Colors.black),
          const SizedBox(height: 24),
          _buildDataList('Recent Vitals', _vitals.take(10).toList(), (item) {
            return [
              if (item['resting_hr_bpm'] != null)
                'HR: ${item['resting_hr_bpm']} bpm',
              if (item['hrv_ms'] != null) 'HRV: ${item['hrv_ms']} ms',
            ];
          }),
        ],
      ),
    );
  }

  Widget _buildSleepTab() {
    if (_sleep.isEmpty) {
      return _buildEmptyState(
          'No sleep data available', Icons.bedtime_outlined);
    }

    final chartData = _sleep.reversed.toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 300,
            child: LineChart(
              LineChartData(
                gridData: const FlGridData(show: true),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: true),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        if (value.toInt() >= 0 &&
                            value.toInt() < chartData.length) {
                          final date = chartData[value.toInt()]['date'];
                          if (date != null) {
                            try {
                              final dateTime = DateTime.parse(date);
                              return Text(
                                DateFormat('MM/dd').format(dateTime),
                                style: const TextStyle(fontSize: 10),
                              );
                            } catch (e) {
                              return const Text('');
                            }
                          }
                        }
                        return const Text('');
                      },
                    ),
                  ),
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                ),
                borderData: FlBorderData(show: true),
                lineBarsData: [
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['sleep_total_min'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.black,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['rem_min'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.grey[600]!,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['deep_min'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.grey[400]!,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildLegendItem('Total Sleep (min)', Colors.black),
          const SizedBox(height: 8),
          _buildLegendItem('REM (min)', Colors.grey),
          const SizedBox(height: 8),
          _buildLegendItem('Deep (min)', Colors.grey.shade400),
          const SizedBox(height: 24),
          _buildDataList('Recent Sleep', _sleep.take(10).toList(), (item) {
            return [
              if (item['sleep_total_min'] != null)
                'Total: ${item['sleep_total_min']} min',
              if (item['rem_min'] != null) 'REM: ${item['rem_min']} min',
              if (item['deep_min'] != null) 'Deep: ${item['deep_min']} min',
            ];
          }),
        ],
      ),
    );
  }

  Widget _buildBodyTab() {
    if (_bodyMetrics.isEmpty) {
      return _buildEmptyState(
          'No body metrics data available', Icons.monitor_weight_outlined);
    }

    final chartData = _bodyMetrics.reversed.toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 300,
            child: LineChart(
              LineChartData(
                gridData: const FlGridData(show: true),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: true),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        if (value.toInt() >= 0 &&
                            value.toInt() < chartData.length) {
                          final date = chartData[value.toInt()]['date'];
                          if (date != null) {
                            try {
                              final dateTime = DateTime.parse(date);
                              return Text(
                                DateFormat('MM/dd').format(dateTime),
                                style: const TextStyle(fontSize: 10),
                              );
                            } catch (e) {
                              return const Text('');
                            }
                          }
                        }
                        return const Text('');
                      },
                    ),
                  ),
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                ),
                borderData: FlBorderData(show: true),
                lineBarsData: [
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['weight_kg'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.black,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                  LineChartBarData(
                    spots: chartData.asMap().entries.map((entry) {
                      final value = entry.value['body_fat_pct'];
                      return FlSpot(
                        entry.key.toDouble(),
                        value != null ? value.toDouble() : 0,
                      );
                    }).toList(),
                    isCurved: true,
                    color: Colors.grey[600]!,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: false),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildLegendItem('Weight (kg)', Colors.black),
          const SizedBox(height: 8),
          _buildLegendItem('Body Fat (%)', Colors.grey),
          const SizedBox(height: 24),
          _buildDataList('Recent Body Metrics', _bodyMetrics.take(10).toList(),
              (item) {
            return [
              if (item['weight_kg'] != null) 'Weight: ${item['weight_kg']} kg',
              if (item['body_fat_pct'] != null)
                'Body Fat: ${item['body_fat_pct']}%',
            ];
          }),
        ],
      ),
    );
  }

  Widget _buildLegendItem(String label, Color color) {
    return Row(
      children: [
        Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }

  Widget _buildDataList(String title, List<dynamic> items,
      List<String> Function(Map<String, dynamic>) getValues) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        ...items.map((item) {
          final values = getValues(item as Map<String, dynamic>);
          if (values.isEmpty) return const SizedBox.shrink();
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: AppTheme.surfaceColor,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ListTile(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              title: Text(
                item['date'] != null
                    ? DateFormat('MMM dd, yyyy')
                        .format(DateTime.parse(item['date']))
                    : 'Unknown date',
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  values.join(' • '),
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildEmptyState(String message, IconData icon) {
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
              icon,
              size: 40,
              color: Colors.grey.shade400,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            message,
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
}
