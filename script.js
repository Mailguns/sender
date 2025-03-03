
document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const emailContent = document.getElementById('email-content');
  const previewBtn = document.getElementById('preview-btn');
  const htmlPreview = document.getElementById('html-preview');
  const sendBtn = document.getElementById('send-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const resetBtn = document.getElementById('reset-btn');
  const testSmtpBtn = document.getElementById('test-smtp-btn');
  const logContainer = document.getElementById('log-container');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const recipientInput = document.getElementById('recipient-input');
  const recipientFileInput = document.getElementById('recipient-file-input');
  const recipientFileName = document.getElementById('recipient-file-name');
  const attachmentInput = document.getElementById('attachment-input');
  const attachmentList = document.getElementById('attachment-list');
  const totalCount = document.getElementById('total-count');
  const sentCount = document.getElementById('sent-count');
  const failedCount = document.getElementById('failed-count');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const themeButtons = document.querySelectorAll('.theme-btn');
  
  // State
  let isPaused = false;
  let isCancelled = false;
  let sendingInProgress = false;
  let sentEmails = 0;
  let failedEmails = 0;
  let totalEmails = 0;
  let currentRecipientIndex = 0;
  let recipients = [];
  let attachments = [];
  let currentSmtpIndex = 0;
  let smtpServers = [];
  
  // Handle tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      tab.classList.add('active');
      document.querySelector(`[data-tab-content="${tab.dataset.tab}"]`).classList.add('active');
    });
  });
  
  // Handle theme switching
  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.theme) {
        // Theme switch (light/dark)
        if (btn.dataset.theme === 'dark') {
          document.body.classList.add('dark-mode');
        } else {
          document.body.classList.remove('dark-mode');
        }
        
        // Make only the clicked theme button active
        themeButtons.forEach(b => {
          if (b.dataset.theme) {
            b.classList.toggle('active', b === btn);
          }
        });
      } else if (btn.dataset.layout) {
        // Layout switch
        document.body.classList.remove('modern-layout', 'compact-layout');
        if (btn.dataset.layout !== 'default') {
          document.body.classList.add(btn.dataset.layout);
        }
        
        // Make only the clicked layout button active
        themeButtons.forEach(b => {
          if (b.dataset.layout) {
            b.classList.toggle('active', b === btn);
          }
        });
      }
    });
  });
  
  // HTML Preview
  previewBtn.addEventListener('click', function() {
    const content = emailContent.value;
    htmlPreview.innerHTML = content.replace(/{Email}/g, 'example@domain.com').replace(/{Domain}/g, 'domain.com');
  });
  
  // Recipient file upload
  recipientFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      recipientFileName.textContent = file.name;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const content = e.target.result;
        recipientInput.value = content;
      };
      reader.readAsText(file);
    }
  });
  
  // Attachment handling
  attachmentInput.addEventListener('change', function(e) {
    attachments = Array.from(e.target.files);
    if (attachments.length > 0) {
      attachmentList.textContent = attachments.map(file => file.name).join(', ');
    } else {
      attachmentList.textContent = 'No files selected';
    }
  });
  
  // Log message function
  function logMessage(message, isError = false) {
    const logEntry = document.createElement('div');
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEntry.className = isError ? 'log-error' : 'log-success';
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  // Update statistics
  function updateStats() {
    totalCount.textContent = totalEmails;
    sentCount.textContent = sentEmails;
    failedCount.textContent = failedEmails;
  }
  
  // Parse SMTP rotation
  function parseSmtpRotation() {
    const rotationText = document.getElementById('smtp-rotation').value.trim();
    if (!rotationText) return [];
    
    return rotationText.split('\n').map(line => {
      const [host, user, pass, port] = line.split(',').map(item => item.trim());
      return { host, user, pass, port: port || '465' };
    }).filter(config => config.host && config.user && config.pass);
  }
  
  // Get current SMTP config
  function getCurrentSmtp() {
    if (smtpServers.length > 0) {
      const config = smtpServers[currentSmtpIndex];
      currentSmtpIndex = (currentSmtpIndex + 1) % smtpServers.length;
      return config;
    }
    
    return {
      host: document.getElementById('smtp-host').value,
      port: document.getElementById('smtp-port').value,
      user: document.getElementById('smtp-user').value,
      pass: document.getElementById('smtp-pass').value
    };
  }
  
  // Test SMTP connection
  testSmtpBtn.addEventListener('click', async function() {
    const smtpConfig = getCurrentSmtp();
    
    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
      logMessage('Please fill in all SMTP fields', true);
      return;
    }
    
    loadingOverlay.classList.remove('hidden');
    
    try {
      const response = await fetch('/api/test-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(smtpConfig)
      });
      
      const result = await response.json();
      
      if (result.success) {
        logMessage('SMTP connection successful!');
      } else {
        logMessage(`SMTP connection failed: ${result.error}`, true);
      }
    } catch (error) {
      logMessage(`Error testing SMTP: ${error.message}`, true);
    } finally {
      loadingOverlay.classList.add('hidden');
    }
  });
  
  // Send emails
  async function sendEmails() {
    const delay = parseInt(document.getElementById('smtp-delay').value) * 1000 || 3000;
    const senderName = document.getElementById('sender-name').value;
    const subject = document.getElementById('subject').value;
    const content = emailContent.value;
    
    smtpServers = parseSmtpRotation();
    
    // Get default SMTP config
    const defaultSmtp = {
      host: document.getElementById('smtp-host').value,
      port: document.getElementById('smtp-port').value,
      user: document.getElementById('smtp-user').value,
      pass: document.getElementById('smtp-pass').value
    };
    
    // Validation
    if (!senderName || !subject || !content) {
      logMessage('Please fill in all required fields (sender name, subject, content)', true);
      return;
    }
    
    if (!defaultSmtp.host || !defaultSmtp.user || !defaultSmtp.pass) {
      logMessage('Please fill in all SMTP fields', true);
      return;
    }
    
    if (recipients.length === 0) {
      logMessage('No recipients found', true);
      return;
    }
    
    // Prepare UI for sending
    sendingInProgress = true;
    isPaused = false;
    isCancelled = false;
    sendBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    
    // Send to each recipient
    while (currentRecipientIndex < recipients.length) {
      if (isPaused) {
        await new Promise(resolve => {
          const checkPause = () => {
            if (!isPaused || isCancelled) {
              resolve();
            } else {
              setTimeout(checkPause, 100);
            }
          };
          checkPause();
        });
      }
      
      if (isCancelled) {
        logMessage('Sending cancelled');
        break;
      }
      
      const recipient = recipients[currentRecipientIndex];
      const domain = recipient.split('@')[1] || '';
      
      // Get SMTP config (rotate if multiple servers)
      const smtpConfig = smtpServers.length > 0 ? 
        smtpServers[currentSmtpIndex] : defaultSmtp;
      
      currentSmtpIndex = (currentSmtpIndex + 1) % Math.max(1, smtpServers.length);
      
      // Replace variables in content
      const personalizedContent = content
        .replace(/{Email}/g, recipient)
        .replace(/{Domain}/g, domain);
      
      try {
        const formData = new FormData();
        formData.append('recipient', recipient);
        formData.append('subject', subject);
        formData.append('content', personalizedContent);
        formData.append('senderName', senderName);
        formData.append('smtpHost', smtpConfig.host);
        formData.append('smtpPort', smtpConfig.port);
        formData.append('smtpUser', smtpConfig.user);
        formData.append('smtpPass', smtpConfig.pass);
        
        // Add attachments if any
        attachments.forEach(file => {
          formData.append('attachments', file);
        });
        
        const response = await fetch('/api/send-email', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
          sentEmails++;
          logMessage(`Email sent to ${recipient}`);
        } else {
          failedEmails++;
          logMessage(`Failed to send to ${recipient}: ${result.error}`, true);
        }
      } catch (error) {
        failedEmails++;
        logMessage(`Error sending to ${recipient}: ${error.message}`, true);
      }
      
      updateStats();
      currentRecipientIndex++;
      
      // Wait for the specified delay before sending the next email
      if (currentRecipientIndex < recipients.length && !isCancelled) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Reset UI after sending
    sendingInProgress = false;
    sendBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
    
    if (!isCancelled) {
      logMessage('Email sending completed');
    }
  }
  
  // Send button
  sendBtn.addEventListener('click', function() {
    recipients = recipientInput.value
      .split('\n')
      .map(email => email.trim())
      .filter(email => email.includes('@'));
    
    if (recipients.length === 0) {
      logMessage('No valid recipients found', true);
      return;
    }
    
    totalEmails = recipients.length;
    sentEmails = 0;
    failedEmails = 0;
    currentRecipientIndex = 0;
    updateStats();
    
    // Show loading overlay for 5 seconds before starting
    loadingOverlay.classList.remove('hidden');
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
      sendEmails();
    }, 5000);
  });
  
  // Pause button
  pauseBtn.addEventListener('click', function() {
    if (isPaused) {
      isPaused = false;
      pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
      logMessage('Sending resumed');
    } else {
      isPaused = true;
      pauseBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
      logMessage('Sending paused');
    }
  });
  
  // Cancel button
  cancelBtn.addEventListener('click', function() {
    isCancelled = true;
    isPaused = false;
    logMessage('Cancelling...');
  });
  
  // Reset button
  resetBtn.addEventListener('click', function() {
    if (sendingInProgress) {
      if (!confirm('Sending is in progress. Are you sure you want to reset all fields?')) {
        return;
      }
      isCancelled = true;
    }
    
    // Reset all fields
    document.getElementById('sender-name').value = '';
    document.getElementById('subject').value = '';
    emailContent.value = '';
    recipientInput.value = '';
    document.getElementById('smtp-host').value = '';
    document.getElementById('smtp-user').value = '';
    document.getElementById('smtp-pass').value = '';
    document.getElementById('smtp-rotation').value = '';
    
    // Reset file inputs
    attachmentInput.value = '';
    recipientFileInput.value = '';
    attachmentList.textContent = 'No files selected';
    recipientFileName.textContent = 'No file selected';
    
    // Reset counters
    sentEmails = 0;
    failedEmails = 0;
    totalEmails = 0;
    updateStats();
    
    // Reset UI
    htmlPreview.innerHTML = '';
    logContainer.innerHTML = '';
    
    // Log reset
    logMessage('All fields have been reset');
  });
});
