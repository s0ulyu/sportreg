const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const fs = require("fs");

// 1. Khởi tạo App và Server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 2. Cấu hình Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Phục vụ file tĩnh từ thư mục public

// 3. Kết nối MySQL (XAMPP mặc định: user='root', pass='', db='sportreg_db')
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "sportreg_db",
});

db.connect((err) => {
    if (err) {
        console.error("Lỗi kết nối MySQL:", err);
        return;
    }
    console.log("Đã kết nối thành công đến MySQL (sportreg_db)");
    // Ensure uploads dir exists
    const uploadsDir = path.join(__dirname, "public", "uploads");
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (e) {}

    // Đảm bảo schema có cột phone & avatar, sau đó thực hiện seed
    ensurePhoneColumn(() => {
        ensureAvatarColumn(() => {
            seedUsersOnStartup();
        });
    });
});
// Seeder: chèn 1 admin, 1 athlete, 1 coach, 1 referee nếu email đó chưa tồn tại
function seedUsersOnStartup() {
    const users = [
        { full_name: "Admin User", email: "admin@example.com", password: "Admin@123", role: "admin" },
        { full_name: "Athlete User", email: "athlete@example.com", password: "Athlete@123", role: "athlete" },
        { full_name: "Coach User", email: "coach@example.com", password: "Coach@123", role: "coach" },
        { full_name: "Referee User", email: "referee@example.com", password: "Referee@123", role: "referee" },
    ];

    const saltRounds = 10;
    users.forEach((u) => {
        // Kiểm tra theo email, nếu chưa có thì insert
        db.query("SELECT id FROM users WHERE email = ?", [u.email], (err, results) => {
            if (err) return console.error("Lỗi kiểm tra user", u.email, err);
            if (results.length > 0) {
                console.log("User exists, skipping:", u.email);
                return;
            }

            try {
                const hashed = bcrypt.hashSync(u.password, saltRounds);
                const insertSql = "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)";
                db.query(insertSql, [u.full_name, u.email, hashed, u.role], (insErr) => {
                    if (insErr) return console.error("Lỗi insert seed user", u.email, insErr);
                    console.log("Seeded user:", u.email, `(${u.role})`);
                });
            } catch (e) {
                console.error("Lỗi hash seed user", u.email, e);
            }
        });
    });
}

// Ensure `phone` column exists in `users` table. Calls callback when done.
function ensurePhoneColumn(cb) {
    // Try ALTER with IF NOT EXISTS (MySQL 8+). If it fails, fallback to SHOW COLUMNS check.
    const alterSql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL";
    db.query(alterSql, (err) => {
        if (!err) {
            console.log("Đã đảm bảo cột `phone` tồn tại");
            return cb();
        }

        // Fallback: check existence then add
        db.query("SHOW COLUMNS FROM users LIKE 'phone'", (sErr, results) => {
            if (sErr) {
                console.error("Lỗi kiểm tra cột phone:", sErr);
                return cb();
            }
            if (results.length === 0) {
                db.query("ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL", (addErr) => {
                    if (addErr) console.error("Lỗi thêm cột phone:", addErr);
                    else console.log("Đã thêm cột `phone` vào bảng users");
                    return cb();
                });
            } else {
                return cb();
            }
        });
    });
}

// Ensure `avatar` column exists in `users` table. Calls callback when done.
function ensureAvatarColumn(cb) {
    const alterSql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) NULL";
    db.query(alterSql, (err) => {
        if (!err) {
            console.log("Đã đảm bảo cột `avatar` tồn tại");
            return cb();
        }
        db.query("SHOW COLUMNS FROM users LIKE 'avatar'", (sErr, results) => {
            if (sErr) {
                console.error("Lỗi kiểm tra cột avatar:", sErr);
                return cb();
            }
            if (results.length === 0) {
                db.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL", (addErr) => {
                    if (addErr) console.error("Lỗi thêm cột avatar:", addErr);
                    else console.log("Đã thêm cột `avatar` vào bảng users");
                    return cb();
                });
            } else {
                return cb();
            }
        });
    });
}

// Multer setup for avatar uploads
const uploadsPath = path.join(__dirname, "public", "uploads");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsPath);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || "";
        const userId = req.params.id || "u";
        const name = `user_${userId}_${Date.now()}${ext}`;
        cb(null, name);
    },
});
// Accept only images and limit size
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif/;
        const ext = path.extname(file.originalname).toLowerCase();
        const mime = file.mimetype;
        if (allowed.test(ext.replace(".", "")) && mime.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type"));
        }
    },
});

// 4. Cấu hình Socket.io (Realtime)
io.on("connection", (socket) => {
    console.log("Một người dùng đã kết nối:", socket.id);

    // 1. Cho phép user tham gia vào "phòng" riêng của họ (dựa trên User ID)
    socket.on("join_room", (userId) => {
        socket.join("user_" + userId);
        console.log(`User ${userId} đã tham gia room user_${userId}`);
    });

    socket.on("disconnect", () => {
        console.log("Người dùng đã ngắt kết nối:", socket.id);
    });
});

// 5. Route cơ bản để test
app.get("/api/status", (req, res) => {
    res.json({ status: "Server is running", time: new Date().toLocaleString() });
});

// --- Middleware Check Admin ---
const checkAdmin = (req, res, next) => {
    // Lấy role từ header (Frontend cần gửi lên)
    const userRole = req.headers["x-role"];

    if (userRole === "admin") {
        next();
    } else {
        res.status(403).json({ message: "Từ chối truy cập: Bạn không phải Admin" });
    }
};

// Middleware: Allow action if requester is the same user or an admin
const checkSelfOrAdmin = (req, res, next) => {
    const headerUserId = req.headers["x-user-id"];
    const role = req.headers["x-role"];
    const paramId = req.params.id;

    if (role === "admin" || headerUserId == paramId) return next();
    return res.status(403).json({ message: "Từ chối truy cập" });
};

// =============================================
// AUTH API (Đăng nhập / Đăng ký)
// =============================================

// 1. Đăng nhập
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu" });
    }

    // Query Database kiểm tra user theo email, sau đó so sánh hash bằng bcrypt
    const sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (bcryptErr, isMatch) => {
            if (bcryptErr) {
                console.error("Lỗi bcrypt:", bcryptErr);
                return res.status(500).json({ message: "Lỗi Server" });
            }
            if (!isMatch) return res.status(401).json({ success: false, message: "Email hoặc mật khẩu không đúng" });

            const { password, ...userData } = user;
            res.json({ success: true, user: userData });
        });
    });
});

// Lấy thông tin user (chỉ chính chủ hoặc admin)
app.get("/api/user/:id", checkSelfOrAdmin, (req, res) => {
    const sql = "SELECT id, full_name, email, role, phone, avatar FROM users WHERE id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy người dùng" });
        res.json(results[0]);
    });
});

// Cập nhật thông tin cơ bản (full_name)
app.put("/api/user/:id", checkSelfOrAdmin, (req, res) => {
    const { full_name, phone } = req.body;
    if (!full_name) return res.status(400).json({ message: "Vui lòng nhập họ và tên" });

    const sql = "UPDATE users SET full_name = ?, phone = ? WHERE id = ?";
    db.query(sql, [full_name, phone || null, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        res.json({ success: true, message: "Cập nhật thông tin thành công" });
    });
});

// Đổi mật khẩu (yêu cầu mật khẩu hiện tại)
app.put("/api/user/:id/password", checkSelfOrAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Thiếu mật khẩu" });

    // Lấy hash hiện tại
    db.query("SELECT password FROM users WHERE id = ?", [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy người dùng" });

        const hashed = results[0].password;
        bcrypt.compare(currentPassword, hashed, (cmpErr, isMatch) => {
            if (cmpErr) return res.status(500).json({ message: "Lỗi Server" });
            if (!isMatch) return res.status(401).json({ message: "Mật khẩu hiện tại không đúng" });

            bcrypt.hash(newPassword, 10, (hashErr, newHashed) => {
                if (hashErr) return res.status(500).json({ message: "Lỗi Server" });
                db.query("UPDATE users SET password = ? WHERE id = ?", [newHashed, req.params.id], (upErr) => {
                    if (upErr) return res.status(500).json({ message: "Lỗi Server" });
                    res.json({ success: true, message: "Đã đổi mật khẩu" });
                });
            });
        });
    });
});

// Upload avatar (runs after multer and checkSelfOrAdmin are defined)
app.post("/api/user/:id/avatar", checkSelfOrAdmin, upload.single("avatar"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Chưa có file được gửi" });
    const avatarPath = "/uploads/" + req.file.filename;

    // Lấy avatar cũ để xóa file cũ (nếu có)
    db.query("SELECT avatar FROM users WHERE id = ?", [req.params.id], (qErr, qRes) => {
        if (qErr) {
            console.error("Lỗi khi lấy avatar cũ:", qErr);
        }

        const old = qRes && qRes[0] && qRes[0].avatar ? qRes[0].avatar : null;

        // Cập nhật DB trước, sau đó xóa file cũ (xóa sau để tránh mất file nếu update DB fail)
        db.query("UPDATE users SET avatar = ? WHERE id = ?", [avatarPath, req.params.id], (err) => {
            if (err) {
                console.error("Lỗi khi lưu avatar mới vào DB:", err);
                return res.status(500).json({ message: "Lỗi khi lưu avatar" });
            }

            // Xóa file cũ nếu nằm trong uploads và tồn tại
            if (old && old.startsWith("/uploads/")) {
                const oldPath = path.join(__dirname, "public", old.replace(/^\//, ""));
                fs.unlink(oldPath, (uErr) => {
                    if (uErr) {
                        // Không block nếu xóa thất bại, chỉ log
                        console.warn("Không thể xóa avatar cũ:", oldPath, uErr.message || uErr);
                    }
                });
            }

            res.json({ success: true, avatar: avatarPath });
        });
    });
});

// 2. Đăng ký (Mới)
app.post("/api/signup", (req, res) => {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }

    // Kiểm tra email đã tồn tại chưa
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: "Email này đã được sử dụng" });
        }

        // Insert user mới (Mặc định role là 'athlete') với mật khẩu đã hash
        const saltRounds = 10;
        bcrypt.hash(password, saltRounds, (hashErr, hashed) => {
            if (hashErr) {
                console.error("Lỗi bcrypt:", hashErr);
                return res.status(500).json({ message: "Lỗi Server" });
            }
            const sql = "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)";
            db.query(sql, [full_name, email, hashed, "athlete"], (err, result) => {
                if (err) {
                    console.error("Lỗi MySQL:", err);
                    return res.status(500).json({ message: "Lỗi Server" });
                }
                res.json({ success: true, message: "Đăng ký tài khoản thành công" });
            });
        });
    });
});

// 3. Quản lý Người dùng (Admin Only)
app.get("/api/users", checkAdmin, (req, res) => {
    const sql = "SELECT id, full_name, email, role, created_at FROM users ORDER BY id DESC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        res.json(results);
    });
});

app.post("/api/users", checkAdmin, (req, res) => {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password || !role) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }

    // Check email
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (results.length > 0) return res.status(409).json({ message: "Email đã tồn tại" });

        const saltRounds = 10;
        bcrypt.hash(password, saltRounds, (hashErr, hashed) => {
            if (hashErr) {
                console.error("Lỗi bcrypt:", hashErr);
                return res.status(500).json({ message: "Lỗi Server" });
            }
            const sql = "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)";
            db.query(sql, [full_name, email, hashed, role], (err, result) => {
                if (err) return res.status(500).json({ message: "Lỗi Server" });
                res.json({ success: true, message: "Tạo người dùng thành công" });
            });
        });
    });
});

app.delete("/api/users/:id", checkAdmin, (req, res) => {
    const sql = "DELETE FROM users WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        res.json({ success: true, message: "Đã xóa người dùng" });
    });
});

// =============================================
// TOURNAMENT API (Quản lý giải đấu)
// =============================================

// 1. Lấy danh sách giải đấu (Public)
app.get("/api/tournaments", (req, res) => {
    const sql = "SELECT * FROM tournaments ORDER BY start_date DESC";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json(results);
    });
});

// 2. Lấy chi tiết giải đấu (Public)
app.get("/api/tournaments/:id", (req, res) => {
    const sql = "SELECT * FROM tournaments WHERE id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy giải đấu" });
        }
        res.json(results[0]);
    });
});

// 3. Tạo giải đấu mới (Admin Only)
app.post("/api/tournaments", checkAdmin, (req, res) => {
    const { name, sport_type, start_date, end_date, location, status, description, banner_url, fee, max_participants, registration_deadline, contact_info } = req.body;

    if (!name || !sport_type || !start_date || !end_date || !location) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin giải đấu" });
    }

    const sql = `INSERT INTO tournaments 
        (name, sport_type, start_date, end_date, location, status, description, banner_url, fee, max_participants, registration_deadline, contact_info) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const statusValue = status || "upcoming";

    db.query(
        sql,
        [name, sport_type, start_date, end_date, location, statusValue, description || "", banner_url || "", fee || 0, max_participants || 0, registration_deadline || null, contact_info || ""],
        (err, result) => {
            if (err) {
                console.error("Lỗi MySQL:", err);
                return res.status(500).json({ message: "Lỗi Server" });
            }
            res.json({ success: true, message: "Tạo giải đấu thành công", id: result.insertId });
        }
    );
});

// 4. Cập nhật giải đấu (Admin Only)
app.put("/api/tournaments/:id", checkAdmin, (req, res) => {
    const { name, sport_type, start_date, end_date, location, status, description, banner_url, fee, max_participants, registration_deadline, contact_info } = req.body;
    const tournamentId = req.params.id;

    const sql = `UPDATE tournaments SET 
        name=?, sport_type=?, start_date=?, end_date=?, location=?, status=?,
        description=?, banner_url=?, fee=?, max_participants=?, registration_deadline=?, contact_info=?
        WHERE id=?`;

    db.query(
        sql,
        [name, sport_type, start_date, end_date, location, status, description, banner_url, fee, max_participants, registration_deadline || null, contact_info, tournamentId],
        (err, result) => {
            if (err) {
                console.error("Lỗi MySQL:", err);
                return res.status(500).json({ message: "Lỗi Server" });
            }
            res.json({ success: true, message: "Cập nhật giải đấu thành công" });
        }
    );
});

// 5. Xóa giải đấu (Admin Only)
app.delete("/api/tournaments/:id", checkAdmin, (req, res) => {
    const tournamentId = req.params.id;
    const sql = "DELETE FROM tournaments WHERE id=?";

    db.query(sql, [tournamentId], (err, result) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json({ success: true, message: "Xóa giải đấu thành công" });
    });
});

// =============================================
// REGISTRATION & MATCH API
// =============================================

// 1. Đăng ký thi đấu
app.post("/api/register", (req, res) => {
    const { userId, tournamentId, teamName } = req.body;

    if (!userId || !tournamentId) {
        return res.status(400).json({ message: "Thiếu thông tin đăng ký" });
    }

    // 1. Kiểm tra xem user đã đăng ký giải này chưa
    const checkSql = "SELECT * FROM registrations WHERE user_id = ? AND tournament_id = ?";
    db.query(checkSql, [userId, tournamentId], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: "Bạn đã đăng ký giải đấu này rồi!" });
        }

        // 2. Nếu chưa, tiến hành Insert
        const insertSql = 'INSERT INTO registrations (user_id, tournament_id, status, team_name) VALUES (?, ?, "pending", ?)';
        db.query(insertSql, [userId, tournamentId, teamName || null], (err, result) => {
            if (err) {
                console.error("Lỗi MySQL:", err);
                return res.status(500).json({ message: "Lỗi Server" });
            }
            res.json({ success: true, message: "Đăng ký thành công! Vui lòng chờ duyệt." });
        });
    });
});

// 1.1 Lấy danh sách đăng ký của giải (Admin xem để duyệt)
app.get("/api/tournaments/:id/registrations", (req, res) => {
    const sql = `
        SELECT r.*, u.full_name, u.email 
        FROM registrations r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.tournament_id = ?
        ORDER BY r.id DESC
    `;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        res.json(results);
    });
});

// 1.2 Duyệt / Từ chối đăng ký (Admin Only)
app.put("/api/registrations/:id", checkAdmin, (req, res) => {
    const { status } = req.body; // 'approved' hoặc 'rejected'
    const sql = "UPDATE registrations SET status = ? WHERE id = ?";

    db.query(sql, [status, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ message: "Lỗi Server" });
        res.json({ success: true, message: "Đã cập nhật trạng thái" });
    });
});

// 2. Cập nhật tỉ số (Realtime) - Admin Only
app.post("/api/matches/update-score", checkAdmin, (req, res) => {
    const { matchId, score1, score2 } = req.body;

    if (!matchId || score1 === undefined || score2 === undefined) {
        return res.status(400).json({ message: "Thiếu thông tin cập nhật" });
    }

    // 1. Update vào Database
    const sql = "UPDATE matches SET score1 = ?, score2 = ? WHERE id = ?";
    db.query(sql, [score1, score2, matchId], (err, result) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        // 2. Quan trọng: Bắn tín hiệu Socket cho toàn bộ Client
        io.emit("score_updated", { matchId, score1, score2 });

        res.json({ success: true, message: "Cập nhật tỉ số thành công" });
    });
});

// 3. Kiểm tra trùng lịch (Conflict Detection)
app.post("/api/matches/check-conflict", (req, res) => {
    const { startTime, endTime, venue, date } = req.body;

    // Tạo chuỗi datetime đầy đủ
    const startDateTime = `${date} ${startTime}`; // Ví dụ: 2024-08-12 09:00:00
    const endDateTime = `${date} ${endTime}`; // Ví dụ: 2024-08-12 10:30:00

    // Logic Overlap: (StartA < EndB) AND (EndA > StartB)
    // Giả định trận đấu trong DB kéo dài 90 phút (DATE_ADD)
    const sql = `
        SELECT * FROM matches 
        WHERE venue = ? 
        AND start_time < ? 
        AND DATE_ADD(start_time, INTERVAL 90 MINUTE) > ?
    `;

    db.query(sql, [venue, endDateTime, startDateTime], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        res.json({
            hasConflict: results.length > 0,
            conflictingMatch: results[0] || null,
        });
    });
});

// 4. Tạo lịch thi đấu tự động (Admin Only)
app.post("/api/tournaments/:id/generate-matches", checkAdmin, (req, res) => {
    const tournamentId = req.params.id;

    // 1. Lấy danh sách đội đã approved
    // Join users để lấy tên nếu team_name null (trường hợp thi đấu cá nhân)
    const sql = `
        SELECT r.*, u.full_name 
        FROM registrations r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.tournament_id = ? AND r.status = 'approved'
    `;

    db.query(sql, [tournamentId], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        // Ưu tiên lấy team_name, nếu không có thì lấy full_name
        const teams = results.map((r) => r.team_name || r.full_name);

        // 2. Kiểm tra số lượng
        if (teams.length < 2) {
            return res.status(400).json({ message: "Cần ít nhất 2 đội để tạo lịch thi đấu" });
        }

        if (teams.length % 2 !== 0) {
            return res.status(400).json({ message: `Số lượng đội là lẻ (${teams.length}). Vui lòng thêm đội hoặc xử lý đội miễn đấu.` });
        }

        // 3. Shuffle (Thuật toán ngẫu nhiên)
        teams.sort(() => Math.random() - 0.5);

        // 4. Ghép cặp
        const matchValues = [];
        for (let i = 0; i < teams.length; i += 2) {
            // [tournament_id, team1, team2, status, round]
            // Lưu ý: Insert tên đội vào cột team1, team2
            matchValues.push([tournamentId, teams[i], teams[i + 1], "scheduled", "Vòng 1"]);
        }

        // 5. Insert vào DB (Bulk Insert)
        const insertSql = "INSERT INTO matches (tournament_id, team1, team2, status, round) VALUES ?";

        db.query(insertSql, [matchValues], (insertErr, insertResult) => {
            if (insertErr) {
                console.error("Lỗi MySQL:", insertErr);
                return res.status(500).json({ message: "Lỗi Database: " + insertErr.sqlMessage });
            }

            res.json({
                success: true,
                message: `Đã tạo xong lịch thi đấu cho ${teams.length} đội.`,
            });
        });
    });
});

// 5. Lấy danh sách trận đấu của giải
app.get("/api/tournaments/:id/matches", (req, res) => {
    const sql = "SELECT * FROM matches WHERE tournament_id = ? ORDER BY id ASC";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json(results);
    });
});

// 5.1 Tạo trận đấu thủ công (Admin Only) - MỚI
app.post("/api/matches", checkAdmin, (req, res) => {
    const { tournament_id, team1, team2, round, start_time, venue } = req.body;

    if (!tournament_id || !team1 || !team2) {
        return res.status(400).json({ message: "Vui lòng nhập đủ thông tin (Giải, Đội 1, Đội 2)" });
    }

    const sql = 'INSERT INTO matches (tournament_id, team1, team2, round, start_time, venue, status) VALUES (?, ?, ?, ?, ?, ?, "scheduled")';
    db.query(sql, [tournament_id, team1, team2, round || "Vòng bảng", start_time || null, venue || null], (err, result) => {
        if (err) return res.status(500).json({ message: "Lỗi Server: " + err.sqlMessage });
        res.json({ success: true, message: "Đã thêm trận đấu mới" });
    });
});

// 8. Lấy danh sách các trận đang diễn ra (Live) hoặc sắp diễn ra (Global)
app.get("/api/matches/live", (req, res) => {
    const sql = `
        SELECT m.*, t.name as tournament_name, t.sport_type 
        FROM matches m 
        JOIN tournaments t ON m.tournament_id = t.id 
        WHERE m.status IN ('live', 'upcoming') 
        ORDER BY FIELD(m.status, 'live', 'upcoming'), m.start_time ASC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json(results);
    });
});

// 6. Cập nhật chi tiết trận đấu (Admin Only)
app.put("/api/matches/:id", checkAdmin, (req, res) => {
    const matchId = req.params.id;
    const { score1, score2, start_time, venue, status } = req.body;

    const sql = `UPDATE matches SET 
        score1 = ?, score2 = ?, start_time = ?, venue = ?, status = ? 
        WHERE id = ?`;

    db.query(sql, [score1, score2, start_time || null, venue || null, status || "scheduled", matchId], (err, result) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        // Realtime update
        io.emit("score_updated", { matchId, score1, score2, status, start_time, venue });

        res.json({ success: true, message: "Cập nhật thành công" });
    });
});

// 7. Xóa trận đấu (Admin Only)
app.delete("/api/matches/:id", checkAdmin, (req, res) => {
    const sql = "DELETE FROM matches WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json({ success: true, message: "Đã xóa trận đấu" });
    });
});

// =============================================
// NOTIFICATION API
// =============================================

// 1. Gửi thông báo (Admin -> User)
app.post("/api/notifications/send", checkAdmin, (req, res) => {
    const { userId, title, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ message: "Thiếu thông tin userId hoặc message" });
    }

    const notifTitle = title || "Thông báo mới";

    // 1. Lưu vào Database
    const sql = "INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)";
    db.query(sql, [userId, notifTitle, message], (err, result) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }

        // 2. Gửi Socket đến ĐÚNG user đó (thông qua room đã join)
        io.to("user_" + userId).emit("new_notification", {
            title: notifTitle,
            message: message,
            created_at: new Date(),
        });

        res.json({ success: true, message: "Đã gửi thông báo" });
    });
});

// 2. Lấy danh sách thông báo của User
app.get("/api/notifications/:userId", (req, res) => {
    const sql = "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC";
    db.query(sql, [req.params.userId], (err, results) => {
        if (err) {
            console.error("Lỗi MySQL:", err);
            return res.status(500).json({ message: "Lỗi Server" });
        }
        res.json(results);
    });
});

app.get("/", (req, res) => {
    // Chuyển hướng về trang dashboard nếu truy cập root
    res.redirect("/dashboard/dashboard.html");
});

// 6. Chạy Server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});
