import 'package:flutter/material.dart';
import 'package:corpus_mobile/screens/main_navigation.dart';
import 'package:corpus_mobile/theme/app_theme.dart';

void main() {
  runApp(const CorpusApp());
}

class CorpusApp extends StatelessWidget {
  const CorpusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Corpus',
      theme: AppTheme.lightTheme,
      debugShowCheckedModeBanner: false,
      home: const MainNavigation(),
    );
  }
}
