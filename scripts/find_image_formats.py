import sqlite3
import re

def find_all_image_formats():
    path = 'uploads/npcm_phy_database.db'
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    cursor.execute("SELECT question, explanation, optionA, optionB, optionC, optionD FROM npcmPhy")
    rows = cursor.fetchall()
    
    # We will look for anything that looks like n0309, ne0310, diagram(...), etc.
    # regex to find words starting with 'n' followed by numbers, or 'ne' followed by numbers
    patterns_found = set()
    
    for row in rows:
        for text in row:
            if not text: continue
            
            # Find diagram(xxx)
            diagrams = re.findall(r'diagram\(([^)]+)\)', str(text))
            for d in diagrams:
                patterns_found.add(f"diagram(...) -> {d}")
                
            # Find bare codes like n0301, ne0302
            codes = re.findall(r'\b(ne?\d+)\b', str(text))
            for c in codes:
                patterns_found.add(f"bare code -> {c}")

    conn.close()
    
    # Print distinct pattern types to terminal
    print(f"Total distinct image codes found: {len(patterns_found)}")
    print("Sample of found formats:")
    for pat in list(patterns_found)[:20]:
        print(f"  {pat}")

find_all_image_formats()
