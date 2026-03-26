import sqlite3
import json

db_path = 'uploads/npcm_bio_database.db'

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM npcmBio WHERE quiztype = 'notes' LIMIT 2;")
    rows = cursor.fetchall()
    data = [dict(row) for row in rows]
    print(json.dumps(data, indent=2))
        
    conn.close()
except Exception as e:
    print(e)
