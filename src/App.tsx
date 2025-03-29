import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PresentationList } from './components/PresentationList';
import { PresentationEditor } from './components/PresentationEditor';
import './App.css';
import './index.css';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<PresentationList />} />
        <Route path="/presentation/:id" element={<PresentationEditor />} />
      </Routes>
    </Router>
  );
};

export default App;