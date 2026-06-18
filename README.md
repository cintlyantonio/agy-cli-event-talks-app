# BigQuery Release Radar 🚀

A sleek, responsive, glassmorphic dashboard built to fetch, parse, and filter the Google Cloud BigQuery release notes feed. Includes interactive Twitter (X) share capabilities, character counting trackers, search, and category badge filtering.

Developed with **Python Flask** on the backend and plain **vanilla HTML, CSS, and JavaScript** on the frontend.

---

## ✨ Core Features

* **Sub-Entry Splitting**: Google's feed combines a day's releases into a single text block. The backend splits this HTML content into distinct, atomic updates (Features, Announcements, Issues, and Deprecations).
* **Interactive Tweet Composer**: Click **"Select to Tweet"** on any release block to instantly pre-populate a Twitter post containing the update text and documentation links, formatted inside the 280-character limit.
* **Character Tracker**: A circular radial progress indicator tracks character length, turning yellow and red as you approach the character threshold.
* **Fast Caching**: Feed results are cached in-memory on the server for 10 minutes to bypass Google Cloud rate limits. A **Refresh** button allows manual cache-busting.
* **Dynamic Search & Badge Filters**: Instantly find updates by typing in the search bar or clicking category tabs (Features, Announcements, Issues, Deprecations).

---

## 📂 Repository Structure

```
bq-releases-notes/
├── templates/
│   └── index.html          # Main HTML structure
├── static/
│   ├── css/
│   │   └── style.css       # Custom stylesheets, design variables & animations
│   └── js/
│   │   └── app.js          # DOM rendering, filtering state, and composer math
├── app.py                  # Flask web server, XML parser, and memory caching
├── requirements.txt        # Python dependencies
├── .gitignore              # Files excluded from git indexing
└── README.md               # Project overview (this file)
```

---

## ⚙️ Setup and Installation

### Prerequisites
* Python 3.8 or higher installed on your system.

### 1. Set Up Environment
Navigate to the project directory and create a virtual environment:

```bash
# Navigate to the folder
cd bq-releases-notes

# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Activate virtual environment (macOS/Linux)
source venv/bin/activate
```

### 2. Install Dependencies
Install the required packages:
```bash
pip install -r requirements.txt
```

### 3. Run the Server
Launch the Flask development server:
```bash
python app.py
```

By default, the application runs on **http://127.0.0.1:5000**. Open this link in your browser to view the application.

---

## 🌐 Production Considerations

* **Web Intent Shares**: Twitter posting utilizes official Web Intents (`https://twitter.com/intent/tweet`), which requires no API keys or third-party authentication configuration.
* **Backup Cache**: If the feed fetch fails due to Google service degradation, the server seamlessly serves cached files and issues a warning notification in the UI toast.
