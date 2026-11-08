const { isHostPermitted } = require('../../src/controllers/ncertSearchController');

describe('SSRF Guard & Host Whitelist Validator (P0 Security Guard)', () => {
    describe('Permitted NCERT Hosts', () => {
        test('allows https://ncert.nic.in/textbook/pdf/keph101.pdf', () => {
            expect(isHostPermitted('https://ncert.nic.in/textbook/pdf/keph101.pdf')).toBe(true);
        });

        test('allows http://www.ncert.nic.in/textbook/pdf/kebo101.pdf', () => {
            expect(isHostPermitted('http://www.ncert.nic.in/textbook/pdf/kebo101.pdf')).toBe(true);
        });

        test('allows https://cdn.neetforge.com/ncert/class11/biology.pdf', () => {
            expect(isHostPermitted('https://cdn.neetforge.com/ncert/class11/biology.pdf')).toBe(true);
        });
    });

    describe('Blocked SSRF Vectors (Cloud Metadata & Private IPs)', () => {
        test('blocks AWS cloud metadata service (169.254.169.254)', () => {
            expect(isHostPermitted('http://169.254.169.254/latest/meta-data/')).toBe(false);
            expect(isHostPermitted('http://169.254.169.254/computeMetadata/v1/')).toBe(false);
        });

        test('blocks loopback IP (127.0.0.1)', () => {
            expect(isHostPermitted('http://127.0.0.1:8080/secret')).toBe(false);
            expect(isHostPermitted('http://127.0.1.1/internal')).toBe(false);
        });

        test('blocks Class A private IPs (10.0.0.0/8)', () => {
            expect(isHostPermitted('http://10.0.0.1/admin')).toBe(false);
            expect(isHostPermitted('http://10.255.255.255:3000/db')).toBe(false);
        });

        test('blocks Class B private IPs (172.16.0.0/12)', () => {
            expect(isHostPermitted('http://172.16.0.1/')).toBe(false);
            expect(isHostPermitted('http://172.24.1.1:8000/')).toBe(false);
            expect(isHostPermitted('http://172.31.255.255/')).toBe(false);
        });

        test('blocks Class C private IPs (192.168.0.0/16)', () => {
            expect(isHostPermitted('http://192.168.1.1/router')).toBe(false);
            expect(isHostPermitted('http://192.168.0.100:5000/api')).toBe(false);
        });
    });

    describe('Blocked Non-Whitelisted Domains & Schemes', () => {
        test('blocks arbitrary external domains', () => {
            expect(isHostPermitted('https://attacker.evil.com/payload.pdf')).toBe(false);
            expect(isHostPermitted('https://google.com')).toBe(false);
            expect(isHostPermitted('https://fake-ncert.nic.in.evil.com')).toBe(false);
        });

        test('blocks file:// protocol attempts', () => {
            expect(isHostPermitted('file:///etc/passwd')).toBe(false);
        });

        test('blocks ftp:// and gopher:// protocol attempts', () => {
            expect(isHostPermitted('ftp://ncert.nic.in/secret')).toBe(false);
            expect(isHostPermitted('gopher://ncert.nic.in')).toBe(false);
        });

        test('returns false for invalid and garbage URLs', () => {
            expect(isHostPermitted('')).toBe(false);
            expect(isHostPermitted('not-a-valid-url')).toBe(false);
            expect(isHostPermitted('://broken')).toBe(false);
        });
    });
});
