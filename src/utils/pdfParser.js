const pdf = require('pdf-parse');
const fs = require('fs').promises;

/**
 * Parse mock test PDF/scorecard and extract chapter-wise marks
 * Supports Allen, Aakash, FIITJEE, Resonance formats
 */
class PDFParser {
    constructor() {
        // Common patterns for different test series
        this.patterns = {
            allen: {
                chapterPattern: /Chapter[:\s]+([^\n]+)/gi,
                scorePattern: /(\d+)\/(\d+)|(\d+)\s*out\s*of\s*(\d+)/gi,
                subjectPattern: /Physics|Chemistry|Biology|Botany|Zoology/gi
            },
            aakash: {
                chapterPattern: /Topic[:\s]+([^\n]+)/gi,
                scorePattern: /Marks[:\s]+(\d+)\/(\d+)/gi,
                subjectPattern: /Physics|Chemistry|Biology/gi
            },
            generic: {
                // Generic pattern for any scorecard
                numberPattern: /\d+/g,
                percentagePattern: /(\d+(?:\.\d+)?)\s*%/g
            }
        };
    }

    /**
     * Main parsing function
     */
    async parsePDF(filePath) {
        try {
            const dataBuffer = await fs.readFile(filePath);
            const data = await pdf(dataBuffer);

            const text = data.text;
            const pages = data.numpages;

            // Detect scorecard type
            const institution = this.detectInstitution(text);

            // Extract data based on institution
            const extractedData = await this.extractData(text, institution);

            return {
                success: true,
                institution,
                pages,
                data: extractedData
            };

        } catch (error) {
            console.error('PDF parsing error:', error);
            throw new Error(`Failed to parse PDF: ${error.message}`);
        }
    }

    /**
     * Detect which coaching institution's format
     */
    detectInstitution(text) {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('allen') || lowerText.includes('al len')) {
            return 'Allen';
        } else if (lowerText.includes('aakash') || lowerText.includes('aaakash')) {
            return 'Aakash';
        } else if (lowerText.includes('fiitjee') || lowerText.includes('fii tjee')) {
            return 'FIITJEE';
        } else if (lowerText.includes('resonance')) {
            return 'Resonance';
        } else if (lowerText.includes('nta') || lowerText.includes('national testing agency')) {
            return 'NTA';
        }

        return 'Unknown';
    }

    /**
     * Extract chapter-wise and subject-wise scores
     */
    async extractData(text, institution) {
        const lines = text.split('\n').map(line => line.trim());

        const result = {
            totalScore: 0,
            totalMarks: 720, // NEET default
            percentage: 0,
            subjects: {
                physics: { score: 0, total: 180, chapters: [] },
                chemistry: { score: 0, total: 180, chapters: [] },
                biology: { score: 0, total: 360, chapters: [] }
            }
        };

        let currentSubject = null;
        let currentChapter = null;

        // Parse line by line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect subject
            if (/physics/i.test(line)) {
                currentSubject = 'physics';
            } else if (/chemistry/i.test(line)) {
                currentSubject = 'chemistry';
            } else if (/biology|botany|zoology/i.test(line)) {
                currentSubject = 'biology';
            }

            // Extract scores (pattern: 12/15, 8 out of 12, etc.)
            const scoreMatch = line.match(/(\d+)\s*[\/out of]+\s*(\d+)/i);
            if (scoreMatch && currentSubject) {
                const obtained = parseInt(scoreMatch[1]);
                const total = parseInt(scoreMatch[2]);

                // Look for chapter name in previous few lines
                const chapterName = this.findChapterName(lines, i);

                if (chapterName) {
                    result.subjects[currentSubject].chapters.push({
                        name: chapterName,
                        score: obtained,
                        total: total,
                        percentage: Math.round((obtained / total) * 100)
                    });
                }
            }

            // Extract total score
            if (/total|overall|grand total/i.test(line)) {
                const totalMatch = line.match(/(\d+)\s*[\/out of]+\s*(\d+)/i);
                if (totalMatch) {
                    result.totalScore = parseInt(totalMatch[1]);
                    result.totalMarks = parseInt(totalMatch[2]);
                }
            }
        }

        // Calculate subject totals
        Object.keys(result.subjects).forEach(subject => {
            const chapters = result.subjects[subject].chapters;
            if (chapters.length > 0) {
                result.subjects[subject].score = chapters.reduce((sum, ch) => sum + ch.score, 0);
                result.subjects[subject].total = chapters.reduce((sum, ch) => sum + ch.total, 0);
            }
        });

        // Calculate total if not found
        if (result.totalScore === 0) {
            result.totalScore =
                result.subjects.physics.score +
                result.subjects.chemistry.score +
                result.subjects.biology.score;
        }

        result.percentage = Math.round((result.totalScore / result.totalMarks) * 100);

        return result;
    }

    /**
     * Find chapter name near a score
     */
    findChapterName(lines, currentIndex) {
        // Look in previous 3 lines for chapter names
        const searchRange = 3;
        const startIndex = Math.max(0, currentIndex - searchRange);

        for (let i = currentIndex - 1; i >= startIndex; i--) {
            const line = lines[i];

            // Skip lines with only numbers or common words
            if (/^\d+$/.test(line) || /^(total|marks|score)$/i.test(line)) {
                continue;
            }

            // If line has meaningful text (3+ chars, not just punctuation)
            if (line.length >= 3 && /[a-z]/i.test(line)) {
                return line;
            }
        }

        return null;
    }

    /**
     * Advanced OCR-based parsing (for scanned PDFs)
     * This would use Tesseract.js or similar in production
     */
    async parseScannedPDF(filePath) {
        // Placeholder for OCR implementation
        return {
            success: false,
            error: 'OCR parsing not implemented yet. Please upload a text-based PDF.'
        };
    }

    /**
     * Map extracted chapters to NCERT chapters
     */
    async mapToNCERTChapters(extractedData) {
        const Chapter = require('../models/Chapter');

        const mappedData = {
            ...extractedData,
            ncertMapping: []
        };

        for (const subject of Object.keys(extractedData.subjects)) {
            for (const chapter of extractedData.subjects[subject].chapters) {
                // Fuzzy search for NCERT chapter
                const ncertChapter = await this.findNCERTChapter(chapter.name, subject);

                if (ncertChapter) {
                    mappedData.ncertMapping.push({
                        extractedName: chapter.name,
                        ncertChapterId: ncertChapter.chapterId,
                        ncertChapterName: ncertChapter.name.en,
                        subject: subject,
                        score: chapter.score,
                        total: chapter.total,
                        accuracy: chapter.percentage
                    });
                }
            }
        }

        return mappedData;
    }

    /**
     * Find matching NCERT chapter (fuzzy search)
     */
    async findNCERTChapter(chapterName, subject) {
        const Chapter = require('../models/Chapter');

        // Simple text matching (can be improved with fuzzy search libraries)
        const chapters = await Chapter.find({
            subject,
            isActive: true
        });

        // Find best match
        let bestMatch = null;
        let highestScore = 0;

        for (const chapter of chapters) {
            const score = this.calculateSimilarity(
                chapterName.toLowerCase(),
                chapter.name.en.toLowerCase()
            );

            if (score > highestScore && score > 0.5) { // 50% similarity threshold
                highestScore = score;
                bestMatch = chapter;
            }
        }

        return bestMatch;
    }

    /**
     * Calculate string similarity (Jaccard similarity)
     */
    calculateSimilarity(str1, str2) {
        const words1 = new Set(str1.split(/\s+/));
        const words2 = new Set(str2.split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }
}

module.exports = new PDFParser();
