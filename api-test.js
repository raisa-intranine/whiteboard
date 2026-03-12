const API_URL = "https://whiteboard-backend-phi.vercel.app/api";

async function runTests() {
    console.log("Starting API Tests...");
    const randomEmail = `test_${Date.now()}@example.com`;

    try {
        // 1. Signup
        console.log("1. Testing POST /auth/signup...");
        let res = await fetch(`${API_URL}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Demo User", email: randomEmail, password: "password123" })
        });
        let data = await res.json();
        if (!res.ok) throw new Error("Signup failed: " + JSON.stringify(data));
        const token = data.token;
        const boardId = data.user.boardId;
        console.log("   ✅ Signup OK. Token:", token.slice(0, 15) + "...");

        // 2. Login
        console.log("2. Testing POST /auth/login...");
        res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: randomEmail, password: "password123" })
        });
        data = await res.json();
        if (!res.ok) throw new Error("Login failed: " + JSON.stringify(data));
        console.log("   ✅ Login OK.");

        // 3. Me
        console.log("3. Testing GET /auth/me...");
        res = await fetch(`${API_URL}/auth/me`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        data = await res.json();
        if (!res.ok) throw new Error("Me failed: " + JSON.stringify(data));
        console.log("   ✅ /auth/me OK. Name:", data.name);

        // 4. Save Board
        console.log("4. Testing POST /boards/:id...");
        res = await fetch(`${API_URL}/boards/${boardId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ canvasJson: { version: "5.3.0", objects: [{ type: "test" }] }, background: "#112233" })
        });
        data = await res.json();
        if (!res.ok) throw new Error("Save board failed: " + JSON.stringify(data));
        console.log("   ✅ POST /boards OK.");

        // 5. Load Board
        console.log("5. Testing GET /boards/:id...");
        res = await fetch(`${API_URL}/boards/${boardId}`);
        data = await res.json();
        if (!res.ok) throw new Error("Load board failed: " + JSON.stringify(data));
        console.log("   ✅ GET /boards OK. Background:", data.background);

        // 6. Ably Token
        console.log("6. Testing GET /realtime/token...");
        res = await fetch(`${API_URL}/realtime/token`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        data = await res.json();
        if (!res.ok) throw new Error("Realtime token failed: " + JSON.stringify(data));
        console.log("   ✅ GET /realtime/token OK. Has token request:", !!data.tokenRequest);

        console.log("\n🚀 ALL TESTS PASSED SUCCESSFULLY!");
    } catch (err) {
        console.error("\n❌ TESTS FAILED!");
        console.error(err);
        process.exit(1);
    }
}

runTests();
