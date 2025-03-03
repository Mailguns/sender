
const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB file size limit
});

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Test SMTP Connection
app.post('/api/test-smtp', async (req, res) => {
  const { host, port, user, pass } = req.body;
  
  if (!host || !user || !pass) {
    return res.json({ success: false, error: 'Missing SMTP configuration' });
  }
  
  try {
    // Create a transporter
    const transporter = nodemailer.createTransport({
      host,
      port: port || 465,
      secure: port === '465',
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false // Allows self-signed certificates
      }
    });
    
    // Verify the connection
    await transporter.verify();
    
    res.json({ success: true, message: 'SMTP connection successful' });
  } catch (error) {
    console.error('SMTP Test Error:', error);
    res.json({ 
      success: false, 
      error: error.message || 'Failed to connect to SMTP server' 
    });
  }
});

// Send Email
app.post('/api/send-email', upload.array('attachments'), async (req, res) => {
  const { 
    recipient, 
    subject, 
    content, 
    senderName, 
    smtpHost, 
    smtpPort, 
    smtpUser, 
    smtpPass 
  } = req.body;
  
  const attachments = req.files || [];
  
  if (!recipient || !subject || !content || !smtpHost || !smtpUser || !smtpPass) {
    // Remove uploaded files if request is invalid
    for (const file of attachments) {
      try {
        await unlinkAsync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }
    
    return res.json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }
  
  try {
    // Configure email transport
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort || 465,
      secure: smtpPort === '465', // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false // Allows self-signed certificates
      }
    });
    
    // Prepare attachments for nodemailer
    const emailAttachments = attachments.map(file => ({
      filename: file.originalname,
      path: file.path
    }));
    
    // Set up email data
    const mailOptions = {
      from: `"${senderName}" <${smtpUser}>`,
      to: recipient,
      subject: subject,
      html: content,
      attachments: emailAttachments
    };
    
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    
    // Clean up attachment files
    for (const file of attachments) {
      try {
        await unlinkAsync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }
    
    res.json({ 
      success: true, 
      messageId: info.messageId 
    });
  } catch (error) {
    console.error('Send Email Error:', error);
    
    // Clean up attachment files on error
    for (const file of attachments) {
      try {
        await unlinkAsync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }
    
    res.json({ 
      success: false, 
      error: error.message || 'Failed to send email' 
    });
  }
});

// Add a basic error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ success: false, error: 'Server error occurred' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
