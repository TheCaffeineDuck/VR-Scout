import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { SceneDashboard } from './components/dashboard/SceneDashboard';
import { UploadScreen } from './components/upload/UploadScreen';
import { PipelineMonitor } from './components/pipeline/PipelineMonitor';
import { QAReviewScreen } from './components/qa/QAReviewScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<SceneDashboard />} />
          <Route path="/upload" element={<UploadScreen />} />
          <Route path="/pipeline/:sceneId" element={<PipelineMonitor />} />
          <Route path="/review/:sceneId" element={<QAReviewScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}
