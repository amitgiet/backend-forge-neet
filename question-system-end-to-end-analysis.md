# MemoNeet Question System: End-to-End Technical Analysis

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Question Data Flow](#2-question-data-flow)
3. [Question Type Detection & Routing](#3-question-type-detection--routing)
4. [API Layer & Data Fetching](#4-api-layer--data-fetching)
5. [Question Rendering Logic by Type](#5-question-rendering-logic-by-type)
6. [Image Loading System](#6-image-loading-system)
7. [Video Loading System](#7-video-loading-system)
8. [Filtering & State Management](#8-filtering--state-management)
9. [Answer Validation Logic](#9-answer-validation-logic)
10. [Error Handling & Fallbacks](#10-error-handling--fallbacks)

---

## 1. System Architecture Overview

### 1.1 Technology Stack
```
Frontend: Flutter Web (Compiled to JavaScript)
State Management: Provider Pattern (t.c, t.Q, t.Z providers)
Local DB: Hive (NoSQL)
HTTP Client: DIO
Image Loading: CachedNetworkImage + NetworkImage
Video Player: youtube_player_flutter (iframe-based)
Backend API: memoneet.xyz/api/*
```

### 1.2 Core Classes & Widgets
```dart
// Question Model Classes
- QuestionModel (t.Q) - Main question data
- MCQQuestion (mcq type)
- FillupQuestion (fillup type) - Va class
- MatchQuestion (match type) - H7 class
- OrderQuestion (order type)
- FlashcardQuestion (flashcard type)

// Provider Classes
- QuestionProvider (t.c) - Manages question state
- MCQProvider (t.Q) - MCQ-specific state
- SubjectProvider (t.Z) - Subject/chapter filtering

// Widget Classes
- QuestionRenderer - Main question display widget
- MCQWidget - Multiple choice questions
- FillupWidget (Va) - Text input questions
- MatchWidget (H7) - Matching questions
- OrderWidget - Ordering/sequencing questions
- FlashcardWidget - Flip card questions
```

---

## 2. Question Data Flow

### 2.1 Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTION                               │
│              (Click subject/chapter/test)                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 1: CHECK LOCAL CACHE (HIVE)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Query: Hive.box('questions').get(subject + uids)      │   │
│  │  Key: "Subject.biology" + "uid1,uid2,uid3..."          │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
     CACHE HIT                CACHE MISS
           │                       │
           ▼                       ▼
┌─────────────────┐    ┌──────────────────────────────────────────┐
│ Load from Hive  │    │ STEP 2: API CALL                         │
│ (Instant)       │    │                                          │
│                 │    │ POST https://memoneet.xyz/api/questions  │
│                 │    │ Headers:                                 │
│                 │    │   Content-Type: application/json         │
│                 │    │ Body:                                    │
│                 │    │   {                                      │
│                 │    │     "subject": "Subject.biology",        │
│                 │    │     "uids": ["10100", "10101", ...]      │
│                 │    │   }                                      │
│                 │    └────────────────────┬─────────────────────┘
│                 │                         │
│                 │                         ▼
│                 │    ┌──────────────────────────────────────────┐
│                 │    │ STEP 3: SAVE TO HIVE                     │
│                 │    │ Hive.box('questions').put(key, data)     │
│                 │    └────────────────────┬─────────────────────┘
│                 │                         │
└─────────┬───────┘                         │
          │                                 │
          └──────────────┬──────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 4: PARSE QUESTION JSON                         │
│                                                                  │
│  question = {                                                    │
│    "id": "10100",                                               │
│    "at": "mcq",          ← TYPE FIELD (determines widget)       │
│    "d": "Question text",                                       │
│    "y": "image_url_or_null",                                   │
│    "r": "Explanation text",                                    │
│    "subject": "Subject.biology",                               │
│    "chapter": "The Living World",                              │
│    "topic": "Biological Classification",                       │
│    "difficulty": "medium",                                     │
│    "options": ["A", "B", "C", "D"],  ← For MCQ                  │
│    "correctAnswer": "A",                                       │
│    "videoUrl": "https://youtube.com/watch?v=...",              │
│    "hasImage": true,                                           │
│    "isBookmarked": false                                       │
│  }                                                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│          STEP 5: DETERMINE QUESTION TYPE                         │
│                                                                  │
│  String questionType = question['at'];                          │
│                                                                  │
│  switch (questionType) {                                        │
│    case "mcq":        → Render MCQWidget                        │
│    case "fillup":     → Render FillupWidget (Va)                │
│    case "match":      → Render MatchWidget (H7)                 │
│    case "order":      → Render OrderWidget                      │
│    case "flashcard":  → Render FlashcardWidget                  │
│    default:           → Render ErrorWidget                      │
│  }                                                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│          STEP 6: RENDER QUESTION WIDGET                          │
│                    (See Section 5 for details)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Question Type Detection & Routing

### 3.1 Type Detection Logic (Line 195242-195244, 199818-199820)

```dart
// Primary type detection from question data
class QuestionRenderer {
  Widget buildQuestion(BuildContext context, dynamic questionData, int index) {
    // Extract question type from 'at' field
    String questionType = J.y(questionData, index).at;
    
    // Route to appropriate widget based on type
    switch (questionType) {
      case "mcq":
        return buildMCQWidget(context, questionData, index);
        
      case "match":
        return new H7(
          questionData,           // Full question data
          index,                  // Question index
          getMatchOptions(),      // Available options
          context                 // Build context
        );
        
      case "fillup":
        int questionIndex = index;
        return new Va(
          questionData,           // Full question data
          questionIndex,          // Question index
          new cx_(               // Answer callback handler
            provider,
            questionData,
            index,
            correctAnswer,
            difficulty
          ),
          J.y(questionData, questionIndex).y,  // Question text/image
          index,                                 // Index
          new eB(questionIndex, t.f3)           // Focus node
        );
        
      case "order":
        return buildOrderWidget(context, questionData, index);
        
      case "flashcard":
        // Check if flashcard has content
        if (J.y(questionData, flashcardIndex).r.length !== 0) {
          return buildFlashcardWidget(context, questionData);
        } else {
          return new w(o, o, o, o);  // Empty widget
        }
        
      default:
        return buildErrorWidget("Unknown question type: $questionType");
    }
  }
}
```

### 3.2 Question Type Data Structure

```dart
// Type field mapping (from code analysis)
class QuestionTypes {
  static const String MCQ = "mcq";              // Multiple Choice
  static const String FILLUP = "fillup";        // Fill in the blank
  static const String MATCH = "match";          // Match the following
  static const String ORDER = "order";          // Arrange in order
  static const String FLASHCARD = "flashcard";  // Flashcard revision
}

// Type-specific data fields
class QuestionModel {
  // Common fields (all types)
  String id;              // Unique identifier
  String at;              // Question type (mcq, fillup, etc.)
  String d;               // Question text
  String y;               // Image URL (if any)
  String r;               // Explanation/solution
  String subject;         // Subject.biology, etc.
  String chapter;         // Chapter name
  String topic;           // Topic name
  String difficulty;      // easy, medium, hard
  
  // MCQ-specific
  List<String> options;   // ["A", "B", "C", "D"]
  String correctAnswer;   // "A", "B", "C", or "D"
  
  // Fillup-specific
  String fillupAnswer;    // Correct text answer
  List<String> acceptableAnswers; // Alternative correct answers
  
  // Match-specific
  List<MatchPair> pairs;  // [{left: "...", right: "..."}]
  
  // Order-specific
  List<String> orderItems; // Items to arrange
  List<int> correctOrder;  // Correct sequence [3, 1, 2, 4]
  
  // Flashcard-specific
  String frontContent;    // Front side content
  String backContent;     // Back side content
  
  // Media
  String videoUrl;        // YouTube video URL
  bool hasImage;          // Has associated image
}
```

---

## 4. API Layer & Data Fetching

### 4.1 DIO HTTP Client Configuration (Line 44220-44221)

```dart
class ApiService {
  // DIO instance creation
  static Dio createDio() {
    return Dio(BaseOptions(
      baseUrl: "https://memoneet.xyz",
      connectTimeout: Duration(seconds: 30),
      receiveTimeout: Duration(seconds: 30),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    ));
  }
  
  // Singleton instance
  static final Dio _dio = createDio();
}
```

### 4.2 Question Fetching Methods

```dart
class QuestionRepository {
  final Dio _dio = ApiService._dio;
  
  // METHOD 1: Get questions by UIDs
  Future<List<QuestionModel>> getQuestionsByUids({
    required String subject,
    required List<String> uids,
  }) async {
    try {
      final response = await _dio.post(
        "/api/questions",
        data: {
          "subject": subject,  // "Subject.biology"
          "uids": uids,        // ["10100", "10101", ...]
        },
      );
      
      return (response.data as List)
          .map((json) => QuestionModel.fromJson(json))
          .toList();
          
    } catch (e) {
      throw QuestionLoadException("Failed to load questions: $e");
    }
  }
  
  // METHOD 2: Get question images
  Future<Map<String, dynamic>> getQuestionImages({
    required String subject,
    required String uid,
  }) async {
    final response = await _dio.post(
      "/api/get-question-images",
      data: {
        "subject": subject,
        "uid": uid,
      },
    );
    
    return response.data;
  }
  
  // METHOD 3: Get BTS (Test Series) questions
  Future<List<QuestionModel>> getBTSQuestions() async {
    final response = await _dio.get("/api/get-bts-question/");
    return (response.data as List)
        .map((json) => QuestionModel.fromJson(json))
        .toList();
  }
  
  // METHOD 4: Get question video URL
  Future<String?> getQuestionVideo({
    required String questionId,
    required String subject,
  }) async {
    final response = await _dio.post(
      "/api/get-question-video",
      data: {
        "questionId": questionId,
        "subject": subject,
      },
      options: Options(headers: {"Content-Type": "application/json"}),
    );
    
    return response.data['videoUrl'];
  }
}
```

### 4.3 Local Cache Strategy (Hive)

```dart
class QuestionCache {
  static const String BOX_NAME = 'questions';
  
  // Cache key format: "{subject}_{uid1},{uid2},..."
  static String _generateCacheKey(String subject, List<String> uids) {
    return "${subject}_${uids.join(',')}";
  }
  
  // Save questions to cache
  static Future<void> cacheQuestions({
    required String subject,
    required List<String> uids,
    required List<QuestionModel> questions,
  }) async {
    final box = await Hive.openBox(BOX_NAME);
    final key = _generateCacheKey(subject, uids);
    
    await box.put(key, {
      'timestamp': DateTime.now().toIso8601String(),
      'data': questions.map((q) => q.toJson()).toList(),
    });
  }
  
  // Get questions from cache
  static Future<List<QuestionModel>?> getCachedQuestions({
    required String subject,
    required List<String> uids,
  }) async {
    final box = await Hive.openBox(BOX_NAME);
    final key = _generateCacheKey(subject, uids);
    
    final cached = box.get(key);
    if (cached == null) return null;
    
    // Check if cache is expired (24 hours)
    final timestamp = DateTime.parse(cached['timestamp']);
    if (DateTime.now().difference(timestamp).inHours > 24) {
      await box.delete(key);
      return null;
    }
    
    return (cached['data'] as List)
        .map((json) => QuestionModel.fromJson(json))
        .toList();
  }
}
```

---

## 5. Question Rendering Logic by Type

### 5.1 MCQ (Multiple Choice Questions)

```dart
class MCQWidget extends StatefulWidget {
  final QuestionModel question;
  final int index;
  final Function(String) onAnswerSelected;
  
  MCQWidget({
    required this.question,
    required this.index,
    required this.onAnswerSelected,
  });
  
  @override
  _MCQWidgetState createState() => _MCQWidgetState();
}

class _MCQWidgetState extends State<MCQWidget> {
  String? selectedOption;
  bool isAnswered = false;
  
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Question text/image
        buildQuestionContent(),
        
        // Options (A, B, C, D)
        ...widget.question.options.asMap().entries.map((entry) {
          int idx = entry.key;
          String option = entry.value;
          String optionLabel = ['A', 'B', 'C', 'D'][idx];
          
          return buildOptionTile(
            label: optionLabel,
            text: option,
            isSelected: selectedOption == optionLabel,
            isCorrect: widget.question.correctAnswer == optionLabel,
            showResult: isAnswered,
            onTap: () => handleOptionSelect(optionLabel),
          );
        }).toList(),
        
        // Explanation (shown after answering)
        if (isAnswered) buildExplanation(),
      ],
    );
  }
  
  Widget buildQuestionContent() {
    return Column(
      children: [
        // Question text
        Text(widget.question.d),
        
        // Question image (if exists)
        if (widget.question.hasImage && widget.question.y != null)
          CachedNetworkImage(
            imageUrl: widget.question.y,
            placeholder: (context, url) => CircularProgressIndicator(),
            errorWidget: (context, url, error) => Icon(Icons.error),
          ),
          
        // Video thumbnail (if exists)
        if (widget.question.videoUrl != null)
          buildVideoThumbnail(widget.question.videoUrl),
      ],
    );
  }
  
  void handleOptionSelect(String option) {
    setState(() {
      selectedOption = option;
      isAnswered = true;
    });
    
    // Notify parent
    widget.onAnswerSelected(option);
    
    // Update provider state
    Provider.of<MCQProvider>(context, listen: false)
        .setAnswer(widget.index, option);
  }
}
```

### 5.2 Fillup (Fill in the Blank) - Va Class

```dart
class FillupWidget extends StatefulWidget {
  final dynamic questionData;    // Raw question JSON
  final int questionIndex;       // Index in question list
  final cx_ answerHandler;       // Callback for answer validation
  final String questionText;     // Display text
  final int index;               // Question number
  final eB focusNode;            // Input focus management
  
  FillupWidget({
    required this.questionData,
    required this.questionIndex,
    required this.answerHandler,
    required this.questionText,
    required this.index,
    required this.focusNode,
  });
  
  @override
  _FillupWidgetState createState() => _FillupWidgetState();
}

class _FillupWidgetState extends State<FillupWidget> {
  TextEditingController _controller = TextEditingController();
  bool isAnswered = false;
  bool isCorrect = false;
  
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Question number
        Text("Question ${widget.index + 1}"),
        
        // Question text with blank
        buildQuestionWithBlank(),
        
        // Text input field
        TextField(
          controller: _controller,
          focusNode: widget.focusNode,
          decoration: InputDecoration(
            hintText: "Type your answer here...",
            border: OutlineInputBorder(),
          ),
          onSubmitted: (value) => validateAnswer(value),
        ),
        
        // Submit button
        ElevatedButton(
          onPressed: () => validateAnswer(_controller.text),
          child: Text("Submit"),
        ),
        
        // Result feedback
        if (isAnswered)
          buildResultFeedback(),
          
        // Explanation
        if (isAnswered)
          buildExplanation(),
      ],
    );
  }
  
  Widget buildQuestionWithBlank() {
    // Parse question text to find blank marker
    // Format: "The capital of India is _______."
    String text = widget.questionText;
    
    return RichText(
      text: TextSpan(
        children: [
          TextSpan(text: text.split('____')[0]),
          WidgetSpan(
            child: Container(
              width: 100,
              height: 30,
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(width: 2)),
              ),
              child: Center(child: Text(isAnswered ? _controller.text : "")),
            ),
          ),
          if (text.split('____').length > 1)
            TextSpan(text: text.split('____')[1]),
        ],
      ),
    );
  }
  
  void validateAnswer(String userAnswer) {
    // Get correct answer from question data
    String correctAnswer = J.y(widget.questionData, widget.questionIndex).correctAnswer;
    
    // Normalize answers (case-insensitive, trim whitespace)
    String normalizedUser = userAnswer.trim().toLowerCase();
    String normalizedCorrect = correctAnswer.trim().toLowerCase();
    
    // Check if answer is correct
    bool correct = normalizedUser == normalizedCorrect;
    
    // Check acceptable alternatives
    List<String> alternatives = J.y(widget.questionData, widget.questionIndex).acceptableAnswers ?? [];
    for (String alt in alternatives) {
      if (normalizedUser == alt.trim().toLowerCase()) {
        correct = true;
        break;
      }
    }
    
    setState(() {
      isAnswered = true;
      isCorrect = correct;
    });
    
    // Call answer handler
    widget.answerHandler.onAnswer(
      questionIndex: widget.questionIndex,
      userAnswer: userAnswer,
      isCorrect: correct,
    );
  }
  
  Widget buildResultFeedback() {
    return Container(
      padding: EdgeInsets.all(16),
      color: isCorrect ? Colors.green.shade100 : Colors.red.shade100,
      child: Row(
        children: [
          Icon(isCorrect ? Icons.check_circle : Icons.cancel),
          SizedBox(width: 8),
          Text(isCorrect ? "Correct!" : "Incorrect"),
        ],
      ),
    );
  }
}
```

### 5.3 Match (Match the Following) - H7 Class

```dart
class MatchWidget extends StatefulWidget {
  final dynamic questionData;    // Full question JSON
  final int questionIndex;       // Question index
  final List<String> options;    // Right-side options
  final BuildContext context;    // Build context
  
  MatchWidget({
    required this.questionData,
    required this.questionIndex,
    required this.options,
    required this.context,
  });
  
  @override
  _MatchWidgetState createState() => _MatchWidgetState();
}

class _MatchWidgetState extends State<MatchWidget> {
  // Map of left items to selected right items
  Map<String, String?> userMatches = {};
  
  // Original pairs from question data
  List<MatchPair> correctPairs = [];
  
  @override
  void initState() {
    super.initState();
    // Parse correct pairs from question data
    correctPairs = parseMatchPairs(widget.questionData);
    
    // Initialize user matches as empty
    for (var pair in correctPairs) {
      userMatches[pair.left] = null;
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Instructions
        Text("Match the items in Column A with Column B"),
        
        // Match grid
        Row(
          children: [
            // Column A (Left items)
            Expanded(
              child: Column(
                children: correctPairs.map((pair) {
                  return buildLeftItem(pair.left);
                }).toList(),
              ),
            ),
            
            // Connection lines (visual)
            Container(width: 50, child: buildConnectionLines()),
            
            // Column B (Right items - draggable)
            Expanded(
              child: Column(
                children: widget.options.map((option) {
                  return buildRightItem(option);
                }).toList(),
              ),
            ),
          ],
        ),
        
        // Submit button
        ElevatedButton(
          onPressed: checkAllMatched() ? validateMatches : null,
          child: Text("Submit"),
        ),
        
        // Results
        if (isAnswered) buildMatchResults(),
      ],
    );
  }
  
  Widget buildLeftItem(String text) {
    return Container(
      padding: EdgeInsets.all(12),
      margin: EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Text(text),
          if (userMatches[text] != null)
            Chip(label: Text(userMatches[text]!)),
        ],
      ),
    );
  }
  
  Widget buildRightItem(String option) {
    // Check if this option is already matched
    bool isMatched = userMatches.values.contains(option);
    
    return Draggable<String>(
      data: option,
      child: Container(
        padding: EdgeInsets.all(12),
        margin: EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          color: isMatched ? Colors.grey.shade300 : Colors.blue.shade100,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(option),
      ),
      feedback: Material(
        child: Container(
          padding: EdgeInsets.all(12),
          color: Colors.blue,
          child: Text(option, style: TextStyle(color: Colors.white)),
        ),
      ),
    );
  }
  
  void onDrop(String leftItem, String rightItem) {
    setState(() {
      userMatches[leftItem] = rightItem;
    });
  }
  
  bool checkAllMatched() {
    return userMatches.values.every((v) => v != null);
  }
  
  void validateMatches() {
    int correctCount = 0;
    
    for (var pair in correctPairs) {
      if (userMatches[pair.left] == pair.right) {
        correctCount++;
      }
    }
    
    setState(() {
      isAnswered = true;
      score = correctCount;
    });
  }
}

class MatchPair {
  final String left;
  final String right;
  
  MatchPair({required this.left, required this.right});
}
```

### 5.4 Order (Arrange in Order)

```dart
class OrderWidget extends StatefulWidget {
  final QuestionModel question;
  
  OrderWidget({required this.question});
  
  @override
  _OrderWidgetState createState() => _OrderWidgetState();
}

class _OrderWidgetState extends State<OrderWidget> {
  List<String> currentOrder = [];
  bool isAnswered = false;
  
  @override
  void initState() {
    super.initState();
    // Initialize with shuffled items
    currentOrder = List.from(widget.question.orderItems)..shuffle();
  }
  
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text("Arrange the following in correct order:"),
        
        // Reorderable list
        ReorderableColumn(
          onReorder: (oldIndex, newIndex) {
            setState(() {
              if (newIndex > oldIndex) newIndex--;
              final item = currentOrder.removeAt(oldIndex);
              currentOrder.insert(newIndex, item);
            });
          },
          children: currentOrder.asMap().entries.map((entry) {
            return ListTile(
              key: ValueKey(entry.value),
              leading: CircleAvatar(child: Text('${entry.key + 1}')),
              title: Text(entry.value),
              trailing: Icon(Icons.drag_handle),
            );
          }).toList(),
        ),
        
        ElevatedButton(
          onPressed: validateOrder,
          child: Text("Submit"),
        ),
        
        if (isAnswered) buildOrderResults(),
      ],
    );
  }
  
  void validateOrder() {
    bool correct = true;
    for (int i = 0; i < currentOrder.length; i++) {
      int correctIndex = widget.question.correctOrder[i];
      if (currentOrder[i] != widget.question.orderItems[correctIndex]) {
        correct = false;
        break;
      }
    }
    
    setState(() {
      isAnswered = true;
      isCorrect = correct;
    });
  }
}
```

### 5.5 Flashcard

```dart
class FlashcardWidget extends StatefulWidget {
  final QuestionModel question;
  
  FlashcardWidget({required this.question});
  
  @override
  _FlashcardWidgetState createState() => _FlashcardWidgetState();
}

class _FlashcardWidgetState extends State<FlashcardWidget> {
  bool isFlipped = false;
  
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => isFlipped = !isFlipped),
      child: AnimatedContainer(
        duration: Duration(milliseconds: 300),
        width: double.infinity,
        height: 300,
        decoration: BoxDecoration(
          color: isFlipped ? Colors.green.shade100 : Colors.blue.shade100,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black26,
              blurRadius: 8,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Center(
          child: Text(
            isFlipped 
                ? widget.question.backContent  // Answer
                : widget.question.frontContent, // Question
            style: TextStyle(fontSize: 24),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
```

---

## 6. Image Loading System

### 6.1 Image Loading Architecture

```dart
class ImageLoadingSystem {
  
  // PRIMARY: CachedNetworkImage with error handling
  static Widget loadQuestionImage(String? imageUrl) {
    if (imageUrl == null || imageUrl.isEmpty) {
      return SizedBox.shrink();  // No image
    }
    
    return CachedNetworkImage(
      imageUrl: imageUrl,
      placeholder: (context, url) => buildLoadingShimmer(),
      errorWidget: (context, url, error) => buildErrorPlaceholder(),
      fit: BoxFit.contain,
      memCacheWidth: 800,  // Optimize memory
      memCacheHeight: 600,
    );
  }
  
  // FALLBACK: NetworkImage if cache fails
  static Widget loadWithFallback(String imageUrl) {
    return Image.network(
      imageUrl,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return CircularProgressIndicator(
          value: loadingProgress.expectedTotalBytes != null
              ? loadingProgress.cumulativeBytesLoaded / 
                loadingProgress.expectedTotalBytes!
              : null,
        );
      },
      errorBuilder: (context, error, stackTrace) {
        return Icon(Icons.broken_image, size: 50);
      },
    );
  }
  
  // YOUTUBE THUMBNAIL: For video questions
  static Widget loadYouTubeThumbnail(String videoId) {
    String thumbnailUrl = "https://img.youtube.com/vi/$videoId/0.jpg";
    
    return CachedNetworkImage(
      imageUrl: thumbnailUrl,
      placeholder: (context, url) => Container(
        color: Colors.grey.shade300,
        child: Center(child: CircularProgressIndicator()),
      ),
      errorWidget: (context, url, error) => Container(
        color: Colors.grey,
        child: Icon(Icons.play_circle_outline, size: 50),
      ),
    );
  }
  
  static Widget buildLoadingShimmer() {
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade300,
      highlightColor: Colors.grey.shade100,
      child: Container(
        color: Colors.white,
        width: double.infinity,
        height: 200,
      ),
    );
  }
  
  static Widget buildErrorPlaceholder() {
    return Container(
      color: Colors.grey.shade200,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: Colors.red),
            Text("Failed to load image"),
          ],
        ),
      ),
    );
  }
}
```

### 6.2 Image Source Resolution

```dart
class ImageSourceResolver {
  
  // Resolve image URL from question data
  static String? resolveImageUrl(dynamic questionData, int index) {
    // Try different fields where image might be stored
    
    // Field 1: 'y' field (primary)
    String? imageUrl = J.y(questionData, index).y;
    if (imageUrl != null && imageUrl.isNotEmpty) {
      return imageUrl;
    }
    
    // Field 2: 'imageUrl' field
    imageUrl = J.y(questionData, index).imageUrl;
    if (imageUrl != null && imageUrl.isNotEmpty) {
      return imageUrl;
    }
    
    // Field 3: Check nested image object
    dynamic imageObj = J.y(questionData, index).image;
    if (imageObj != null) {
      return imageObj['url'] ?? imageObj['src'];
    }
    
    return null;  // No image found
  }
  
  // Check if question has image
  static bool hasImage(dynamic questionData, int index) {
    return resolveImageUrl(questionData, index) != null;
  }
}
```

---

## 7. Video Loading System

### 7.1 YouTube Video Extraction & Loading

```dart
class YouTubeVideoSystem {
  
  // Extract video ID from various YouTube URL formats
  static String? extractVideoId(String url) {
    // Pattern 1: Standard watch URL
    // https://www.youtube.com/watch?v=VIDEO_ID
    RegExp pattern1 = RegExp(
      r'^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([_\-a-zA-Z0-9]{11}).*$'
    );
    
    // Pattern 2: Music URL
    // https://music.youtube.com/watch?v=VIDEO_ID
    RegExp pattern2 = RegExp(
      r'^https:\/\/(?:music\.)?youtube\.com\/watch\?v=([_\-a-zA-Z0-9]{11}).*$'
    );
    
    // Pattern 3: Shorts URL
    // https://www.youtube.com/shorts/VIDEO_ID
    RegExp pattern3 = RegExp(
      r'^https:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([_\-a-zA-Z0-9]{11}).*$'
    );
    
    // Pattern 4: Embed URL
    // https://www.youtube.com/embed/VIDEO_ID
    RegExp pattern4 = RegExp(
      r'^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/embed\/([_\-a-zA-Z0-9]{11}).*$'
    );
    
    // Pattern 5: Short URL (youtu.be)
    // https://youtu.be/VIDEO_ID
    RegExp pattern5 = RegExp(
      r'^https:\/\/youtu\.be\/([_\-a-zA-Z0-9]{11}).*$'
    );
    
    List<RegExp> patterns = [pattern1, pattern2, pattern3, pattern4, pattern5];
    
    for (var pattern in patterns) {
      Match? match = pattern.firstMatch(url);
      if (match != null && match.groupCount >= 1) {
        return match.group(1);
      }
    }
    
    return null;  // Invalid URL
  }
  
  // Build YouTube player widget
  static Widget buildYouTubePlayer(String videoUrl) {
    String? videoId = extractVideoId(videoUrl);
    
    if (videoId == null) {
      return buildInvalidVideoWidget();
    }
    
    return YoutubePlayerIFrame(
      controller: YoutubePlayerController(
        initialVideoId: videoId,
        params: YoutubePlayerParams(
          showControls: true,
          showFullscreenButton: true,
          privacyEnhanced: true,
          useHybridComposition: true,
        ),
      ),
    );
  }
  
  // Build video thumbnail with play button
  static Widget buildVideoThumbnail(String videoUrl, VoidCallback onTap) {
    String? videoId = extractVideoId(videoUrl);
    
    if (videoId == null) {
      return buildInvalidVideoWidget();
    }
    
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Thumbnail image
          CachedNetworkImage(
            imageUrl: "https://img.youtube.com/vi/$videoId/0.jpg",
            width: double.infinity,
            height: 200,
            fit: BoxFit.cover,
            placeholder: (context, url) => Container(
              color: Colors.grey.shade300,
              child: Center(child: CircularProgressIndicator()),
            ),
            errorWidget: (context, url, error) => Container(
              color: Colors.grey,
              child: Icon(Icons.video_library, size: 50),
            ),
          ),
          
          // Play button overlay
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: Colors.red,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.play_arrow, color: Colors.white, size: 40),
          ),
        ],
      ),
    );
  }
  
  // API call to get video for question
  static Future<String?> fetchQuestionVideo({
    required String questionId,
    required String subject,
  }) async {
    try {
      final response = await Dio().post(
        "https://memoneet.xyz/api/get-question-video",
        data: {
          "questionId": questionId,
          "subject": subject,
        },
        options: Options(headers: {"Content-Type": "application/json"}),
      );
      
      return response.data['videoUrl'];
    } catch (e) {
      print("Error fetching video: $e");
      return null;
    }
  }
  
  static Widget buildInvalidVideoWidget() {
    return Container(
      height: 200,
      color: Colors.grey.shade200,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 50, color: Colors.red),
            Text("Invalid video URL"),
          ],
        ),
      ),
    );
  }
}
```

### 7.2 Video Player Implementation (Web)

```dart
class WebVideoPlayer extends StatelessWidget {
  final String videoId;
  
  WebVideoPlayer({required this.videoId});
  
  @override
  Widget build(BuildContext context) {
    // For web, use iframe-based player
    return HtmlElementView(
      viewType: 'youtube-player-$videoId',
      onPlatformViewCreated: (int viewId) {
        // Initialize player
      },
    );
  }
  
  // JavaScript interop for web
  static String getPlayerHtml(String videoId) {
    return '''
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          background-color: #000000;
          overflow: hidden;
          height: 100%;
          width: 100%;
        }
        iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <iframe 
        src="https://www.youtube.com/embed/$videoId?enablejsapi=1&origin=https://memoneet.xyz"
        allowfullscreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
      </iframe>
    </body>
    </html>
    ''';
  }
}
```

---

## 8. Filtering & State Management

### 8.1 Question Filtering System

```dart
class QuestionFilterSystem {
  
  // Filter types
  static const String FILTER_ALL = "all";
  static const String FILTER_BOOKMARKED = "bookmarked";
  static const String FILTER_INCORRECT = "incorrect";
  static const String FILTER_UNATTEMPTED = "unattempted";
  static const String FILTER_BY_DIFFICULTY = "difficulty";
  static const String FILTER_BY_TOPIC = "topic";
  
  // Apply filters to question list
  static List<QuestionModel> applyFilters({
    required List<QuestionModel> questions,
    required FilterCriteria criteria,
    required UserProgress progress,
  }) {
    List<QuestionModel> filtered = List.from(questions);
    
    // Filter 1: By bookmark status
    if (criteria.showBookmarkedOnly) {
      filtered = filtered.where((q) => q.isBookmarked).toList();
    }
    
    // Filter 2: By attempt status
    if (criteria.filterByAttemptStatus) {
      filtered = filtered.where((q) {
        bool attempted = progress.hasAttempted(q.id);
        
        switch (criteria.attemptStatus) {
          case AttemptStatus.attempted:
            return attempted;
          case AttemptStatus.unattempted:
            return !attempted;
          case AttemptStatus.incorrect:
            return attempted && !progress.wasCorrect(q.id);
          default:
            return true;
        }
      }).toList();
    }
    
    // Filter 3: By difficulty
    if (criteria.difficulty != null) {
      filtered = filtered.where((q) => 
        q.difficulty == criteria.difficulty
      ).toList();
    }
    
    // Filter 4: By topic
    if (criteria.topic != null) {
      filtered = filtered.where((q) => 
        q.topic == criteria.topic
      ).toList();
    }
    
    // Filter 5: By question type
    if (criteria.questionTypes.isNotEmpty) {
      filtered = filtered.where((q) => 
        criteria.questionTypes.contains(q.at)
      ).toList();
    }
    
    // Filter 6: Shuffle (if enabled)
    if (criteria.shuffle) {
      filtered.shuffle();
    }
    
    return filtered;
  }
  
  // Get available topics from questions
  static List<String> extractTopics(List<QuestionModel> questions) {
    return questions
        .map((q) => q.topic)
        .toSet()
        .toList()
      ..sort();
  }
  
  // Get difficulty distribution
  static Map<String, int> getDifficultyDistribution(
    List<QuestionModel> questions
  ) {
    Map<String, int> distribution = {'easy': 0, 'medium': 0, 'hard': 0};
    
    for (var q in questions) {
      distribution[q.difficulty] = (distribution[q.difficulty] ?? 0) + 1;
    }
    
    return distribution;
  }
}

class FilterCriteria {
  bool showBookmarkedOnly = false;
  bool filterByAttemptStatus = false;
  AttemptStatus attemptStatus = AttemptStatus.all;
  String? difficulty;
  String? topic;
  List<String> questionTypes = [];
  bool shuffle = false;
}

enum AttemptStatus { all, attempted, unattempted, incorrect }
```

### 8.2 State Management (Provider Pattern)

```dart
// Main Question Provider
class QuestionProvider extends ChangeNotifier {
  List<QuestionModel> _questions = [];
  List<QuestionModel> _filteredQuestions = [];
  int _currentIndex = 0;
  bool _isLoading = false;
  String? _error;
  
  // Getters
  List<QuestionModel> get questions => _filteredQuestions;
  int get currentIndex => _currentIndex;
  bool get isLoading => _isLoading;
  String? get error => _error;
  QuestionModel? get currentQuestion => 
      _filteredQuestions.isNotEmpty ? _filteredQuestions[_currentIndex] : null;
  
  // Load questions
  Future<void> loadQuestions({
    required String subject,
    required List<String> uids,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    try {
      // 1. Check cache first
      var cached = await QuestionCache.getCachedQuestions(
        subject: subject,
        uids: uids,
      );
      
      if (cached != null) {
        _questions = cached;
      } else {
        // 2. Fetch from API
        _questions = await QuestionRepository().getQuestionsByUids(
          subject: subject,
          uids: uids,
        );
        
        // 3. Save to cache
        await QuestionCache.cacheQuestions(
          subject: subject,
          uids: uids,
          questions: _questions,
        );
      }
      
      _filteredQuestions = List.from(_questions);
      _currentIndex = 0;
      
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
  
  // Apply filters
  void applyFilters(FilterCriteria criteria, UserProgress progress) {
    _filteredQuestions = QuestionFilterSystem.applyFilters(
      questions: _questions,
      criteria: criteria,
      progress: progress,
    );
    _currentIndex = 0;
    notifyListeners();
  }
  
  // Navigate questions
  void nextQuestion() {
    if (_currentIndex < _filteredQuestions.length - 1) {
      _currentIndex++;
      notifyListeners();
    }
  }
  
  void previousQuestion() {
    if (_currentIndex > 0) {
      _currentIndex--;
      notifyListeners();
    }
  }
  
  void jumpToQuestion(int index) {
    if (index >= 0 && index < _filteredQuestions.length) {
      _currentIndex = index;
      notifyListeners();
    }
  }
}

// MCQ-specific provider
class MCQProvider extends ChangeNotifier {
  Map<int, String> _selectedAnswers = {};  // questionIndex -> answer
  Map<int, bool> _answerResults = {};      // questionIndex -> isCorrect
  
  void setAnswer(int questionIndex, String answer) {
    _selectedAnswers[questionIndex] = answer;
    notifyListeners();
  }
  
  String? getSelectedAnswer(int questionIndex) {
    return _selectedAnswers[questionIndex];
  }
  
  void setResult(int questionIndex, bool isCorrect) {
    _answerResults[questionIndex] = isCorrect;
    notifyListeners();
  }
  
  bool? getResult(int questionIndex) {
    return _answerResults[questionIndex];
  }
  
  // Calculate accuracy
  double getAccuracy() {
    if (_answerResults.isEmpty) return 0.0;
    
    int correct = _answerResults.values.where((v) => v).length;
    return correct / _answerResults.length;
  }
}
```

---

## 9. Answer Validation Logic

### 9.1 Validation by Question Type

```dart
class AnswerValidator {
  
  // Validate answer based on question type
  static ValidationResult validate({
    required QuestionModel question,
    required dynamic userAnswer,
  }) {
    switch (question.at) {
      case "mcq":
        return validateMCQ(
          correctAnswer: question.correctAnswer,
          userAnswer: userAnswer as String,
        );
        
      case "fillup":
        return validateFillup(
          correctAnswer: question.fillupAnswer,
          acceptableAnswers: question.acceptableAnswers,
          userAnswer: userAnswer as String,
        );
        
      case "match":
        return validateMatch(
          correctPairs: question.matchPairs,
          userPairs: userAnswer as Map<String, String>,
        );
        
      case "order":
        return validateOrder(
          correctOrder: question.correctOrder,
          userOrder: userAnswer as List<String>,
        );
        
      default:
        return ValidationResult.invalid();
    }
  }
  
  // MCQ validation
  static ValidationResult validateMCQ({
    required String correctAnswer,
    required String userAnswer,
  }) {
    bool isCorrect = correctAnswer.toUpperCase() == userAnswer.toUpperCase();
    
    return ValidationResult(
      isCorrect: isCorrect,
      message: isCorrect ? "Correct!" : "Incorrect. Correct answer: $correctAnswer",
      score: isCorrect ? 1.0 : 0.0,
    );
  }
  
  // Fillup validation with fuzzy matching
  static ValidationResult validateFillup({
    required String correctAnswer,
    required List<String> acceptableAnswers,
    required String userAnswer,
  }) {
    String normalizedUser = _normalizeAnswer(userAnswer);
    String normalizedCorrect = _normalizeAnswer(correctAnswer);
    
    // Exact match
    if (normalizedUser == normalizedCorrect) {
      return ValidationResult.correct();
    }
    
    // Check acceptable alternatives
    for (String alt in acceptableAnswers) {
      if (normalizedUser == _normalizeAnswer(alt)) {
        return ValidationResult.correct();
      }
    }
    
    // Fuzzy match (80% similarity)
    double similarity = _calculateSimilarity(normalizedUser, normalizedCorrect);
    if (similarity >= 0.8) {
      return ValidationResult(
        isCorrect: true,
        message: "Correct! (with minor spelling variation)",
        score: 1.0,
      );
    }
    
    return ValidationResult.incorrect(
      correctAnswer: correctAnswer,
    );
  }
  
  // Match validation
  static ValidationResult validateMatch({
    required List<MatchPair> correctPairs,
    required Map<String, String> userPairs,
  }) {
    int correctCount = 0;
    
    for (var pair in correctPairs) {
      if (userPairs[pair.left] == pair.right) {
        correctCount++;
      }
    }
    
    double score = correctCount / correctPairs.length;
    bool isCorrect = score == 1.0;
    
    return ValidationResult(
      isCorrect: isCorrect,
      message: "$correctCount/${correctPairs.length} correct matches",
      score: score,
    );
  }
  
  // Order validation
  static ValidationResult validateOrder({
    required List<int> correctOrder,
    required List<String> userOrder,
  }) {
    bool isCorrect = true;
    
    for (int i = 0; i < userOrder.length; i++) {
      int correctIndex = correctOrder[i];
      if (userOrder[i] != userOrder[correctIndex]) {
        isCorrect = false;
        break;
      }
    }
    
    return ValidationResult(
      isCorrect: isCorrect,
      message: isCorrect ? "Perfect order!" : "Incorrect order",
      score: isCorrect ? 1.0 : 0.0,
    );
  }
  
  // Helper: Normalize answer text
  static String _normalizeAnswer(String answer) {
    return answer
        .toLowerCase()
        .trim()
        .replaceAll(RegExp(r'\s+'), ' ')  // Multiple spaces to single
        .replaceAll(RegExp(r'[^\w\s]'), '');  // Remove punctuation
  }
  
  // Helper: Calculate string similarity (Levenshtein distance)
  static double _calculateSimilarity(String s1, String s2) {
    if (s1 == s2) return 1.0;
    if (s1.isEmpty || s2.isEmpty) return 0.0;
    
    int maxLen = s1.length > s2.length ? s1.length : s2.length;
    int distance = _levenshteinDistance(s1, s2);
    
    return 1.0 - (distance / maxLen);
  }
  
  static int _levenshteinDistance(String s1, String s2) {
    // Implementation of Levenshtein distance algorithm
    // ... (standard implementation)
    return 0;  // Placeholder
  }
}

class ValidationResult {
  final bool isCorrect;
  final String message;
  final double score;
  final String? correctAnswer;
  
  ValidationResult({
    required this.isCorrect,
    required this.message,
    required this.score,
    this.correctAnswer,
  });
  
  factory ValidationResult.correct() => ValidationResult(
        isCorrect: true,
        message: "Correct!",
        score: 1.0,
      );
  
  factory ValidationResult.incorrect({String? correctAnswer}) => ValidationResult(
        isCorrect: false,
        message: "Incorrect",
        score: 0.0,
        correctAnswer: correctAnswer,
      );
  
  factory ValidationResult.invalid() => ValidationResult(
        isCorrect: false,
        message: "Invalid answer format",
        score: 0.0,
      );
}
```

---

## 10. Error Handling & Fallbacks

### 10.1 Comprehensive Error Handling

```dart
class QuestionSystemErrorHandler {
  
  // Handle question loading errors
  static Widget handleLoadingError(dynamic error, VoidCallback onRetry) {
    String message = "Failed to load questions";
    IconData icon = Icons.error_outline;
    
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
          message = "Connection timed out. Please check your internet.";
          icon = Icons.wifi_off;
          break;
        case DioExceptionType.receiveTimeout:
          message = "Server is taking too long to respond.";
          break;
        case DioExceptionType.badResponse:
          if (error.response?.statusCode == 404) {
            message = "Questions not found.";
          } else if (error.response?.statusCode == 500) {
            message = "Server error. Please try again later.";
          }
          break;
        default:
          message = "Network error. Please check your connection.";
      }
    }
    
    return ErrorWidget(
      message: message,
      icon: icon,
      onRetry: onRetry,
    );
  }
  
  // Handle image loading errors
  static Widget handleImageError(String? originalUrl) {
    return Container(
      color: Colors.grey.shade200,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.broken_image, size: 50, color: Colors.grey),
          SizedBox(height: 8),
          Text(
            "Image not available",
            style: TextStyle(color: Colors.grey.shade600),
          ),
          if (originalUrl != null)
            TextButton(
              onPressed: () => _openImageInBrowser(originalUrl),
              child: Text("Open in browser"),
            ),
        ],
      ),
    );
  }
  
  // Handle video loading errors
  static Widget handleVideoError(String? videoUrl) {
    return Container(
      height: 200,
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.play_circle_outline, size: 50, color: Colors.white54),
            SizedBox(height: 8),
            Text(
              "Video unavailable",
              style: TextStyle(color: Colors.white70),
            ),
            if (videoUrl != null)
              TextButton(
                onPressed: () => _launchURL(videoUrl),
                child: Text("Open on YouTube"),
              ),
          ],
        ),
      ),
    );
  }
  
  // Handle answer submission errors
  static void handleAnswerError(BuildContext context, dynamic error) {
    String message = "Failed to submit answer";
    
    if (error is ValidationException) {
      message = error.message;
    }
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        action: SnackBarAction(
          label: "Retry",
          onPressed: () {
            // Retry logic
          },
        ),
      ),
    );
  }
  
  static void _openImageInBrowser(String url) {
    // Launch URL in browser
  }
  
  static void _launchURL(String url) {
    // Launch URL
  }
}

// Error Widget Component
class ErrorWidget extends StatelessWidget {
  final String message;
  final IconData icon;
  final VoidCallback onRetry;
  
  ErrorWidget({
    required this.message,
    required this.icon,
    required this.onRetry,
  });
  
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 64, color: Colors.red.shade300),
          SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16),
          ),
          SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: Icon(Icons.refresh),
            label: Text("Retry"),
          ),
        ],
      ),
    );
  }
}
```

### 10.2 Fallback Strategies

```dart
class FallbackStrategies {
  
  // Fallback for image
  static Widget getImageWithFallback(String? primaryUrl, String? fallbackUrl) {
    if (primaryUrl == null || primaryUrl.isEmpty) {
      if (fallbackUrl != null) {
        return Image.network(fallbackUrl);
      }
      return SizedBox.shrink();
    }
    
    return CachedNetworkImage(
      imageUrl: primaryUrl,
      errorWidget: (context, url, error) {
        if (fallbackUrl != null) {
          return Image.network(fallbackUrl);
        }
        return Icon(Icons.image_not_supported);
      },
    );
  }
  
  // Fallback for video
  static Widget getVideoWithFallback(String? primaryUrl, String? fallbackUrl) {
    if (primaryUrl == null) {
      if (fallbackUrl != null) {
        return YouTubeVideoSystem.buildYouTubePlayer(fallbackUrl);
      }
      return QuestionSystemErrorHandler.handleVideoError(null);
    }
    
    return YouTubeVideoSystem.buildYouTubePlayer(primaryUrl);
