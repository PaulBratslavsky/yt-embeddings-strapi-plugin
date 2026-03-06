import { Page } from '@strapi/strapi/admin';
import { Routes, Route } from 'react-router-dom';

import { HomePage } from './HomePage';
import VideoDetails from './EmbeddingDetails';

const App = () => {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/video/:videoId" element={<VideoDetails />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  );
};

export { App };
