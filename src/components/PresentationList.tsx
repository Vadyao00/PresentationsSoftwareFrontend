import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Presentation } from '../models';
import { apiService } from '../services/api.service';

export const PresentationList: React.FC = () => {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [newPresentationTitle, setNewPresentationTitle] = useState('');
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedPresentationId, setSelectedPresentationId] = useState<number | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    loadPresentations();
    
    const savedNickname = localStorage.getItem('nickname');
    if (savedNickname) {
      setNickname(savedNickname);
    }
  }, []);

  const loadPresentations = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getPresentations();
      setPresentations(data);
      setError(null);
    } catch (err) {
      setError('Failed to load presentations');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePresentation = async () => {
    if (!newPresentationTitle.trim() || !nickname.trim()) {
      setError('Please enter both a title and your nickname');
      return;
    }
  
    try {
      setIsLoading(true);
      const newPresentation = await apiService.createPresentation({
        title: newPresentationTitle,
        author: nickname
      });
      
      if (!newPresentation) {
        setError('Failed to create presentation. Please try again.');
        setIsLoading(false);
        return;
      }
      
      localStorage.setItem('nickname', nickname);
      
      localStorage.setItem(`createdPresentation_${newPresentation.id}`, 'true');
      console.log(`Marked user as creator of presentation ${newPresentation.id} in localStorage`);
      
      const creatorState = { nickname, isCreator: true };
      console.log('Navigating to presentation with creator state:', creatorState);
      
      navigate(`/presentation/${newPresentation.id}`, { 
        state: creatorState
      });
    } catch (err) {
      setError('Failed to create presentation');
      console.error(err);
      setIsLoading(false);
    }
  };

  const handleRowClick = (presentationId: number) => {
    setSelectedPresentationId(presentationId);
    setShowJoinModal(true);
  };

  const confirmJoin = () => {
    if (!nickname.trim()) {
      setError('Please enter your nickname');
      return;
    }

    if (selectedPresentationId) {
      localStorage.setItem('nickname', nickname);
      
      const isCreator = localStorage.getItem(`createdPresentation_${selectedPresentationId}`) === 'true';
      
      if (isCreator) {
        console.log(`User is rejoining presentation ${selectedPresentationId} as the creator`);
      }
      
      navigate(`/presentation/${selectedPresentationId}`, { 
        state: { 
          nickname, 
          isCreator
        }
      });
    }
  };

  return (
    <div className="presentation-list-container">
      <header className="app-header">
        <h1>Collaborative Presentations</h1>
        <button 
          className="create-btn"
          onClick={() => {
            setNickname(localStorage.getItem('nickname') || '');
            setShowCreateModal(true);
          }}
        >
          Create New Presentation
        </button>
      </header>

      {error && <div className="error-message">{error}</div>}

      {isLoading ? (
        <div className="loading">Loading presentations...</div>
      ) : (
        <div className="presentation-table">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {presentations.map((presentation) => (
                <tr 
                  key={presentation.id} 
                  onClick={() => handleRowClick(presentation.id)}
                  className="clickable-row"
                >
                  <td>{presentation.title}</td>
                  <td>{presentation.author}</td>
                  <td>{new Date(presentation.uploadDate).toLocaleDateString()}</td>
                </tr>
              ))}
              {presentations.length === 0 && (
                <tr>
                  <td colSpan={3}>No presentations found. Create one to get started!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Create New Presentation</h2>
            <div className="form-group">
              <label>Presentation Title:</label>
              <input
                type="text"
                value={newPresentationTitle}
                onChange={(e) => setNewPresentationTitle(e.target.value)}
                placeholder="Enter title"
              />
            </div>
            <div className="form-group">
              <label>Your Nickname:</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your nickname"
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={handleCreatePresentation} className="confirm-btn">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Join Presentation</h2>
            <div className="form-group">
              <label>Your Nickname:</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your nickname"
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowJoinModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={confirmJoin} className="confirm-btn">
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};