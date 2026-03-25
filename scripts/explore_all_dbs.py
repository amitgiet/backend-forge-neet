import sqlite3
import os
import sys
import json

# Ensure UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

db_files = [
    ('Biology Main', 'uploads/biology_questions.db'),
    ('Chemistry Main', 'uploads/chemistry_questions.db'),
    ('Physics NPCM', 'uploads/npcm_phy_database.db'),
    ('Biology NPCM', 'uploads/npcm_bio_database.db'),
    ('Chemistry NPCM', 'uploads/npcm_chem_database.db'),
    ('Physics Main', 'uploads/physics_questions.db'),
    ('Subject Cache', 'uploads/subject_cache.db'),
]

results = {}

for label, path in db_files:
    print(f"\n{'='*60}")
    print(f" DATABASE: {label}")
    print(f" Path: {path}")
    print(f"{'='*60}")
    
    if not os.path.exists(path):
        print(f"  -> FILE NOT FOUND")
        results[label] = {"error": "File not found", "path": path}
        continue
    
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cursor.fetchall()]
        
        print(f"  Total Tables: {len(tables)}")
        print(f"  Tables: {tables}")
        
        db_info = {
            "path": path,
            "total_tables": len(tables),
            "tables": {}
        }
        
        # Analyze each table
        for table in tables:
            print(f"\n  --- TABLE: {table} ---")
            
            try:
                # Get column info
                cursor.execute(f'PRAGMA table_info("{table}")')
                columns = [c[1] for c in cursor.fetchall()]
                print(f"    Columns: {columns}")
                
                # Get row count
                cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                count = cursor.fetchone()[0]
                print(f"    Row Count: {count}")
                
                # Get sample row
                cursor.execute(f'SELECT * FROM "{table}" LIMIT 1')
                row = cursor.fetchone()
                
                table_info = {
                    "columns": columns,
                    "row_count": count,
                    "sample": {}
                }
                
                if row:
                    sample = {}
                    for col in row.keys():
                        val = str(row[col])
                        # Truncate long values
                        if len(val) > 80:
                            val = val[:80] + "..."
                        sample[col] = val
                    table_info["sample"] = sample
                    
                    # Print key fields
                    if 'uniqueId' in row.keys():
                        print(f"    Sample uniqueId: {row['uniqueId']}")
                    if 'topicName' in row.keys():
                        print(f"    Sample topicName: {row['topicName']}")
                    if 'quizType' in row.keys():
                        print(f"    Sample quizType: {row['quizType']}")
                
                db_info["tables"][table] = table_info
                
            except Exception as e:
                print(f"    Error reading table: {e}")
                db_info["tables"][table] = {"error": str(e)}
        
        results[label] = db_info
        conn.close()
        
    except Exception as e:
        print(f"  Error accessing DB: {e}")
        results[label] = {"error": str(e), "path": path}

# Save results to JSON for reference
with open('scripts/all_db_exploration.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n{'='*60}")
print(" Summary saved to: scripts/all_db_exploration.json")
print(f"{'='*60}")

# Print summary
print("\n\n=== DATABASE SUMMARY ===")
for label, info in results.items():
    if "error" in info:
        print(f"{label}: ERROR - {info['error']}")
    else:
        tables = list(info.get('tables', {}).keys())
        total_rows = sum(t.get('row_count', 0) for t in info.get('tables', {}).values())
        print(f"{label}: {len(tables)} tables, ~{total_rows} total rows")
