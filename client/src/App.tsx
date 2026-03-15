import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { MainContent } from './components/layout/MainContent.tsx';
import { SceneDashboard } from './components/dashboard/SceneDashboard.tsx';
import { UploadScreen } from './components/upload/UploadScreen.tsx';
import { PipelineMonitor } from './components/pipeline/PipelineMonitor.tsx';
import { QAReview } from './components/qa/QAReview.tsx';
import { SettingsScreen } from './components/settings/SettingsScreen.tsx';

function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <MainContent />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<SceneDashboard />} />
          <Route path="/upload" element={<UploadScreen />} />
          <Route path="/scene/:id/upload" element={<UploadScreen />} />
          <Route path="/scene/:id/pipeline" element={<PipelineMonitor />} />
          <Route path="/scene/:id/review" element={<QAReview />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
