# IPQC OCR Standalone Project

Azure Document Intelligence based OCR for IPQC Checksheets with automatic Excel filling.

## Features

- **React Frontend** - User-friendly interface to upload and process PDFs
- **Node.js Backend** - Express server handling OCR and file processing
- **Azure Document Intelligence OCR** - Extract text from IPQC checksheet images/PDFs
- **Python Excel Filler** - Automatically fill IPQC Excel template with extracted data
- **Serial Number Extraction** - Handles OCR variations (GS, G5, 65, etc.)
- **Section-based Mapping** - Maps serial numbers to correct sections (Pre-Lam, Trimming, etc.)

## Project Structure

```
ipqc-ocr-standalone/
├── frontend/                # React Frontend (Port 3000)
│   ├── src/
│   │   ├── App.js          # Main React component
│   │   ├── App.css         # Styles
│   │   └── index.js        # Entry point
│   ├── public/
│   │   └── index.html      # HTML template
│   ├── package.json        # Frontend dependencies
│   └── start-frontend.bat  # Start frontend script
├── server/                  # Node.js Backend (Port 5001)
│   ├── server.js           # Express server
│   ├── fill_complete_ocr.py # Python Excel filler
│   ├── package.json        # Backend dependencies
│   ├── requirements.txt    # Python dependencies
│   └── uploads/            # Uploaded files & filled Excel
├── start-all.bat           # Start both frontend + backend
├── start-server.bat        # Start backend only
└── README.md
```

## Quick Start

**Easiest way:** Double-click `start-all.bat` to start both frontend and backend!

- Frontend: http://localhost:3000
- Backend: http://localhost:5001

## Manual Setup

### 1. Install Backend Dependencies

```bash
cd server
npm install
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Install Python Dependencies

```bash
pip install openpyxl
```

### 4. Configure Excel Template

Edit `server/server.js` and update `EXCEL_TEMPLATE_PATH`:

```javascript
const EXCEL_TEMPLATE_PATH = 'C:\\Users\\hp\\Desktop\\IPQC Check Sheet.xlsx';
```

### 5. Start Servers

**Option 1:** Use start-all.bat (recommended)
```
Double-click start-all.bat
```

**Option 2:** Start separately
```bash
# Terminal 1 - Backend
cd server && node server.js

# Terminal 2 - Frontend  
cd frontend && npm start
```

### 4. Start Server

```bash
npm start
```

Server runs on `http://localhost:5001`

## API Endpoints

### Health Check
```
GET /api/health
```

### Upload Single Image
```
POST /api/ipqc-ocr/upload
Content-Type: multipart/form-data
Body: image (file)
```

### Process Multiple Images
```
POST /api/ipqc-ocr/process-all
Content-Type: multipart/form-data
Body: images[] (files)
```

### Process from PDF URLs
```
POST /api/ipqc-ocr/process-from-urls
Content-Type: application/json
Body: {
  "pdfUrls": ["https://...", "https://..."],
  "checklistInfo": {
    "date": "2026-02-27",
    "line": "Line A",
    "shift": "Day"
  }
}
```

### Download Filled Excel
```
GET /api/ipqc-ocr/download/:filename
```

## Integration with Main App

In your React app (IPQCForm.js), call the `/api/ipqc-ocr/process-from-urls` endpoint:

```javascript
const OCR_API_URL = 'http://localhost:5001';

const response = await fetch(`${OCR_API_URL}/api/ipqc-ocr/process-from-urls`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pdfUrls: [...],
    checklistInfo: {...}
  })
});

const result = await response.json();
// Auto-download Excel
window.open(`${OCR_API_URL}${result.downloadUrl}`);
```

## Excel Fields Filled

| Cell | Field |
|------|-------|
| H80 | Short Side Glue Weight |
| H81 | Long Side Glue Weight |
| H82 | Anodising Thickness |
| H85 | Silicon Glue Weight |
| H49 | Holes Dimension |
| J* | Serial Numbers |
| ... | And many more |

## Troubleshooting

### Azure Rate Limiting (429 Error)
The server automatically waits 10 seconds between OCR calls to avoid rate limiting.

### Python Script Fails
Make sure `openpyxl` is installed:
```bash
pip install openpyxl
```

### Excel Template Not Found
Update the `EXCEL_TEMPLATE_PATH` in `server.js` to point to your IPQC template.

## License

MIT
