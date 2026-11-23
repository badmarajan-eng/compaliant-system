# Complaint Management System
### AI-Based Complaint Analytics, Root Cause Identification & Prediction System

**Project ID:** PS-036

## 1. Project Overview

The Complaint Management System is an AI-powered quality management application designed to help manufacturing industries manage customer complaints, identify potential root causes, analyse historical quality trends, predict future complaint risks, and recommend corrective and preventive actions.

Traditional complaint management systems mainly focus on recording and resolving complaints. However, identifying recurring defects, investigating root causes, and predicting future quality problems can be time-consuming.

This system aims to transform traditional complaint management into a proactive quality improvement process using Artificial Intelligence, data analytics, and predictive techniques.

## 2. Problem Statement

Manufacturing industries receive customer complaints related to product quality, dimensional defects, material issues, machine performance, and manufacturing processes.

Manual complaint analysis makes it difficult to identify recurring defects, determine root causes, understand relationships between products and processes, and predict future complaint trends.

An intelligent system is required to analyse historical and current complaint data, identify quality patterns, estimate future risks, and support effective corrective and preventive actions.

## 3. Proposed Solution

We propose an AI-based Complaint Management System that integrates complaint management, AI-powered analysis, root cause investigation, trend analytics, predictive risk assessment, and CAPA management.

The system analyses historical and newly registered complaints to identify defect patterns and provide useful insights to quality managers.

It also supports early identification of high-risk products and manufacturing processes, helping industries take preventive actions before similar problems increase.

## 4. Key Features

### 1. Dashboard & Historical Data Management
- Displays overall complaint statistics.
- Shows resolved and pending complaints.
- Visualizes complaint trends and defect categories.
- Supports historical complaint data management.
- Supports CSV data import and export.

### 2. Complaint Management
- Register new customer complaints.
- Generate unique complaint IDs.
- Store customer, product, batch, and process information.
- Search, filter, edit, and track complaints.
- Monitor complaint status.

### 3. AI-Based Complaint Classification
- Uses Gemini AI to analyse complaint descriptions.
- Suggests appropriate defect categories.
- Identifies important defect keywords.
- Suggests complaint severity.
- Provides initial quality issue summaries.

### 4. Root Cause Analysis
- Supports investigation of possible defect causes.
- Uses the 6M methodology:
  - Machine
  - Material
  - Method
  - Manpower
  - Measurement
  - Environment
- Provides possible root cause suggestions.
- Supports Fishbone Diagram and 5 Whys analysis.
- Allows quality managers to verify root causes using evidence.

### 5. Trend & Pattern Analytics
- Analyses historical complaint trends.
- Identifies recurring defects.
- Performs product-wise and process-wise analysis.
- Provides Pareto analysis.
- Supports batch-wise and customer-wise comparisons.
- Visualizes quality patterns using interactive charts.

### 6. Predictive Quality Intelligence
- Estimates product and process risk.
- Analyses historical complaint frequency and severity.
- Identifies increasing defect trends.
- Supports future complaint forecasting when sufficient data is available.
- Generates alerts for high-risk products and processes.

### 7. CAPA Management

CAPA stands for Corrective and Preventive Action.

- Suggests immediate containment actions.
- Supports corrective action planning.
- Recommends preventive actions.
- Assigns responsibilities and target dates.
- Tracks implementation progress.
- Supports effectiveness verification.

### 8. Effectiveness Monitoring & Reports
- Compares quality performance before and after CAPA.
- Tracks recurring complaints.
- Monitors CAPA effectiveness.
- Generates quality improvement insights.
- Provides management reports and data exports.

## 5. Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend development |
| TypeScript | Type-safe development |
| Tailwind CSS | User interface styling |
| Node.js | Backend development |
| Gemini API | AI-based complaint analysis and recommendations |
| Vite | Development server and build tool |
| Recharts | Data visualization |
| Lucide React | Icons |
| LocalStorage | Initial local data persistence |
| CSV | Data import and export |

## 6. System Workflow

1. Collect historical and new customer complaint data.
2. Register and manage complaints.
3. Classify complaints using Gemini AI.
4. Analyse possible root causes.
5. Identify recurring defects and quality trends.
6. Estimate future product and process risks.
7. Recommend corrective and preventive actions.
8. Monitor CAPA implementation and effectiveness.
9. Generate quality improvement reports.

## 7. System Architecture

**Frontend:**
- React
- TypeScript
- Tailwind CSS
- Recharts

**Backend:**
- Node.js
- Gemini API integration
- Complaint analysis services
- Data processing and application logic

**Data Management:**
- Historical complaint records
- LocalStorage-based initial persistence
- CSV import and export

**AI Processing:**
- Complaint classification
- Root cause suggestions
- CAPA recommendations
- Quality improvement insights

## 8. Installation and Setup

### Prerequisites
- Node.js
- npm
- Visual Studio Code
- Google AI Studio API key for Gemini-powered features

### Step 1: Clone the Repository

```bash
git clone <your-repository-url>
```

### Step 2: Open the Project Folder

```bash
cd Complaint-Management-System
```

### Step 3: Install Dependencies

```bash
npm install
```

If npm reports a peer dependency conflict:

```bash
npm install --legacy-peer-deps
```

### Step 4: Configure Gemini API

Create a `.env` file in the location expected by the backend configuration.

```env
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Keep the API key on the server side. Never expose it in frontend code or upload the `.env` file to GitHub.

### Step 5: Run the Application

```bash
npm run dev
```

### Step 6: Open in Browser

```text
http://localhost:3000
```

The actual port may differ depending on the project configuration.

## 9. Expected Benefits

- Reduces manual complaint analysis effort.
- Helps identify recurring quality problems.
- Supports faster root cause investigation.
- Improves visibility into manufacturing defects.
- Helps identify high-risk products and processes.
- Supports preventive quality management.
- Improves CAPA tracking and monitoring.
- Helps improve customer satisfaction.

## 10. Future Enhancements

- Integration with manufacturing ERP systems.
- Database integration for large-scale complaint storage.
- Machine learning models trained on verified manufacturing datasets.
- Real-time IoT sensor integration.
- Advanced production quality forecasting.
- Role-based access control.
- Automated email and notification services.
- Industrial quality monitoring integration.

## 11. Important Notes

- AI-generated root causes are suggestions and must be verified using actual evidence.
- Predictive risk scores are estimates, not guaranteed probabilities.
- Prediction quality depends on the availability and quality of historical data.
- Synthetic records used for demonstration must be clearly identified as demo data.
- Gemini API access requires a valid API key and applicable usage limits.

## 12. Project Objective

The main objective of the Complaint Management System is to move manufacturing industries from reactive complaint handling towards proactive quality management.

By combining AI-based analysis, historical data analytics, predictive risk assessment, and CAPA effectiveness monitoring, the system aims to reduce recurring defects, improve manufacturing quality, and increase customer satisfaction.

---

**Project Name:** Complaint Management System  
**Problem Statement:** PS-036  
**Domain:** Artificial Intelligence | Manufacturing | Quality Management