const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

(async function main() {
    const uploadsDir = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
        console.log("No uploads directory found, nothing to clean.");
        process.exit(0);
    }

    // Connect to DB (adjust if you use env vars)
    const db = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "",
        database: "sportreg_db",
    });

    try {
        const [rows] = await db.execute("SELECT avatar FROM users WHERE avatar IS NOT NULL");
        const used = new Set(rows.map((r) => r.avatar)); // values like '/uploads/filename.ext'

        const files = fs.readdirSync(uploadsDir);
        let deleted = 0;
        for (const f of files) {
            const rel = "/uploads/" + f;
            if (!used.has(rel)) {
                const full = path.join(uploadsDir, f);
                try {
                    fs.unlinkSync(full);
                    console.log("Deleted orphan file:", rel);
                    deleted++;
                } catch (e) {
                    console.warn("Failed to delete", full, e.message || e);
                }
            }
        }

        console.log(`Cleanup finished. Deleted ${deleted} file(s).`);
    } catch (err) {
        console.error("Cleanup failed:", err.message || err);
    } finally {
        await db.end();
    }
})();
