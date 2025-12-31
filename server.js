const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

// 1. Khởi tạo App và Server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 2. Cấu hình Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Phục vụ file tĩnh từ thư mục public

// 3. Kết nối MySQL (XAMPP mặc định: user='root', pass='', db='sportreg_db')
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', 
    database: 'sportreg_db'
});

db.connect((err) => {
    if (err) {
        console.error('Lỗi kết nối MySQL:', err);
        return;
    }
    console.log('Đã kết nối thành công đến MySQL (sportreg_db)');
});

// 4. Cấu hình Socket.io (Realtime)
io.on('connection', (socket) => {
    console.log('Một người dùng đã kết nối:', socket.id);

    // 1. Cho phép user tham gia vào "phòng" riêng của họ (dựa trên User ID)
    socket.on('join_room', (userId) => {
        socket.join('user_' + userId);
        console.log(`User ${userId} đã tham gia room user_${userId}`);
    });

    socket.on('disconnect', () => {
        console.log('Người dùng đã ngắt kết nối:', socket.id);
    });
});

// 5. Route cơ bản để test
app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running', time: new Date().toLocaleString() });
});

// --- Middleware Check Admin ---
const checkAdmin = (req, res, next) => {
    // Lấy role từ header (Frontend cần gửi lên)
    const userRole = req.headers['x-role']; 
    
    if (userRole === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Từ chối truy cập: Bạn không phải Admin' });
    }
};

// --- API Đăng nhập ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    // Query Database kiểm tra user
    // Lưu ý: Password đang lưu plain text để test. Thực tế nên dùng bcrypt để hash.
    const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
    db.query(sql, [email, password], (err, results) => {
        if (err) {
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }

        if (results.length > 0) {
            // Tìm thấy user -> Trả về thông tin (loại bỏ password để bảo mật)
            const user = results[0];
            const { password, ...userData } = user;
            res.json({ success: true, user: userData });
        } else {
            res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
        }
    });
});

// --- API Lấy danh sách giải đấu ---
app.get('/api/tournaments', (req, res) => {
    const sql = 'SELECT * FROM tournaments ORDER BY start_date DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }
        res.json(results);
    });
});

// --- API Đăng ký thi đấu ---
app.post('/api/register', (req, res) => {
    const { userId, tournamentId } = req.body;

    if (!userId || !tournamentId) {
        return res.status(400).json({ message: 'Thiếu thông tin đăng ký' });
    }

    // 1. Kiểm tra xem user đã đăng ký giải này chưa
    const checkSql = 'SELECT * FROM registrations WHERE user_id = ? AND tournament_id = ?';
    db.query(checkSql, [userId, tournamentId], (err, results) => {
        if (err) {
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: 'Bạn đã đăng ký giải đấu này rồi!' });
        }

        // 2. Nếu chưa, tiến hành Insert
        const insertSql = 'INSERT INTO registrations (user_id, tournament_id, status) VALUES (?, ?, "pending")';
        db.query(insertSql, [userId, tournamentId], (err, result) => {
            if (err) {
                console.error('Lỗi MySQL:', err);
                return res.status(500).json({ message: 'Lỗi Server' });
            }
            res.json({ success: true, message: 'Đăng ký thành công! Vui lòng chờ duyệt.' });
        });
    });
});

// --- API Cập nhật tỉ số (Realtime) ---
app.post('/api/matches/update-score', checkAdmin, (req, res) => {
    const { matchId, score1, score2 } = req.body;

    if (!matchId || score1 === undefined || score2 === undefined) {
        return res.status(400).json({ message: 'Thiếu thông tin cập nhật' });
    }

    // 1. Update vào Database
    const sql = 'UPDATE matches SET score1 = ?, score2 = ? WHERE id = ?';
    db.query(sql, [score1, score2, matchId], (err, result) => {
        if (err) {
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }

        // 2. Quan trọng: Bắn tín hiệu Socket cho toàn bộ Client
        io.emit('score_updated', { matchId, score1, score2 });

        res.json({ success: true, message: 'Cập nhật tỉ số thành công' });
    });
});

// --- API Kiểm tra trùng lịch (Conflict Detection) ---
app.post('/api/matches/check-conflict', (req, res) => {
    const { startTime, endTime, venue, date } = req.body;
    
    // Tạo chuỗi datetime đầy đủ
    const startDateTime = `${date} ${startTime}`; // Ví dụ: 2024-08-12 09:00:00
    const endDateTime = `${date} ${endTime}`;     // Ví dụ: 2024-08-12 10:30:00

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
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }

        res.json({ 
            hasConflict: results.length > 0, 
            conflictingMatch: results[0] || null 
        });
    });
});

// --- API Gửi thông báo (Admin -> User) ---
app.post('/api/notifications/send', checkAdmin, (req, res) => {
    const { userId, title, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ message: 'Thiếu thông tin userId hoặc message' });
    }

    const notifTitle = title || 'Thông báo mới';

    // 1. Lưu vào Database
    const sql = 'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)';
    db.query(sql, [userId, notifTitle, message], (err, result) => {
        if (err) {
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }

        // 2. Gửi Socket đến ĐÚNG user đó (thông qua room đã join)
        io.to('user_' + userId).emit('new_notification', {
            title: notifTitle,
            message: message,
            created_at: new Date()
        });

        res.json({ success: true, message: 'Đã gửi thông báo' });
    });
});

// --- API Lấy danh sách thông báo của User ---
app.get('/api/notifications/:userId', (req, res) => {
    const sql = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC';
    db.query(sql, [req.params.userId], (err, results) => {
        if (err) {
            console.error('Lỗi MySQL:', err);
            return res.status(500).json({ message: 'Lỗi Server' });
        }
        res.json(results);
    });
});

app.get('/', (req, res) => {
    // Chuyển hướng về trang dashboard nếu truy cập root
    res.redirect('/dashboard/dashboard.html');
});

// 6. Chạy Server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});