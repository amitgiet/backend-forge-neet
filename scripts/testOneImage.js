/**
 * Precise test for the user's provided example
 */
require('dotenv').config();

async function test() {
    const payload = {
        subject: "physics",
        uid: "380107"
    };
    
    console.log(`Testing with: ${JSON.stringify(payload)}`);
    
    try {
        const res = await fetch('https://memoneet.xyz/api/get-question-images', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify(payload)
        });
        
        console.log(`Status: ${res.status}`);
        const contentType = res.headers.get('content-type');
        console.log(`Content-Type: ${contentType}`);
        
        if (contentType.includes('application/json')) {
            const data = await res.json();
            console.log('Response JSON:', JSON.stringify(data, null, 2));
        } else {
            console.log('Response is not JSON.');
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

test();
