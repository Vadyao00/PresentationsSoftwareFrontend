import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import { 
  Presentation, Slide, SlideElement, ElementType, 
  PresentationUser, UserRole 
} from '../models';
import { apiService } from '../services/api.service';
import { signalRService } from '../services/signalr.service';

marked.setOptions({
  async: false
});

export const PresentationEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const presentationId = parseInt(id || '0', 10);
  
  const locationState = location.state as { nickname: string; isCreator: boolean } | null;
  const nickname = locationState?.nickname || localStorage.getItem('nickname') || 'Guest';
  const isCreatorFromState = locationState?.isCreator || false;
  const isCreatorFromStorage = localStorage.getItem(`createdPresentation_${presentationId}`) === 'true';
  const isCreator = isCreatorFromState || isCreatorFromStorage;

  useEffect(() => {
    if (isCreator) {
      localStorage.setItem(`createdPresentation_${presentationId}`, 'true');
      console.log(`*** THIS USER IS THE CREATOR OF PRESENTATION: ${presentationId}`);
    }
  }, [isCreator, presentationId]);

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [users, setUsers] = useState<PresentationUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<PresentationUser | null>(null);
  const [isPresenting, setIsPresenting] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SlideElement | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isError, setIsError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
  const [isInitialized, setIsInitialized] = useState(false);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const eventHandlersSetupRef = useRef(false);

  useEffect(() => {
    if (eventHandlersSetupRef.current) return;
    
    console.log('Setting up event handlers');
    setupEventListeners();
    eventHandlersSetupRef.current = true;
    
    return () => {
      console.log('Cleaning up event handlers');
      cleanupEventListeners();
    };
  }, []);

  useEffect(() => {
    console.log('PresentationEditor component mounted');
    console.log('User role information:', {
      nickname,
      isCreatorFromState,
      isCreatorFromStorage,
      isCreator,
      locationState
    });
    
    const initializePresentation = async () => {
      try {
        setConnectionStatus('Loading presentation data...');
        const data = await apiService.getPresentation(presentationId);
        if (!data) {
          setIsError('Failed to load presentation. It may not exist or the server is unavailable.');
          setConnectionStatus('Error: Failed to load presentation');
          return;
        }
        
        setPresentation(data);
        console.log('Presentation data loaded:', data);
        
        setConnectionStatus('Connecting to SignalR hub...');
        await signalRService.connect();
        setIsConnected(true);
        console.log('Connected to SignalR hub');
        
        console.log('About to join presentation with isCreator flag:', isCreator);
        
        setConnectionStatus('Joining presentation...');
        await signalRService.joinPresentation(presentationId, nickname, isCreator);
        console.log('Joined presentation:', presentationId, 'as', nickname, 'with isCreator flag:', isCreator);
        
        setConnectionStatus('Connected');
        setIsInitialized(true);
        console.log('Successfully initialized presentation');
      } catch (error) {
        console.error('Failed to initialize presentation:', error);
        setIsError(`Failed to load presentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setConnectionStatus('Connection failed');
      }
    };
  
    if (nickname) {
      localStorage.setItem('nickname', nickname);
    }
  
    initializePresentation();
  
    return () => {
      console.log('PresentationEditor component unmounting');
    };
  }, [presentationId, nickname, isCreator, isCreatorFromState, isCreatorFromStorage, locationState]);

  const setupEventListeners = () => {
    signalRService.on<PresentationUser>('UserJoined', (user) => {
      console.log('UserJoined event received:', user);
      setUsers((prevUsers) => {
        const userExists = prevUsers.some(u => u.connectionId === user.connectionId);
        if (userExists) {
          console.log('User already exists in the list, not adding again');
          return prevUsers;
        }
        console.log('Adding new user to the list:', user);
        return [...prevUsers, user];
      });
    });

    signalRService.on<string>('UserLeft', (connectionId) => {
      console.log('UserLeft event received:', connectionId);
      setUsers((prevUsers) => {
        const updatedUsers = prevUsers.filter(u => u.connectionId !== connectionId);
        console.log('Updated users after removal:', updatedUsers);
        return updatedUsers;
      });
    });

    signalRService.on<PresentationUser[]>('UserList', (userList) => {
      console.log('UserList event received with', userList.length, 'users:', userList);
      
      setUsers(userList);
      
      const current = userList.find(u => u.nickname === nickname);
      if (current) {
        console.log('Current user found in user list:', current);
        setCurrentUser(current);
      } else {
        console.warn('Current user not found in the user list. Nickname:', nickname);
      }
    });

    signalRService.on<{ connectionId: string; role: UserRole }>('UserRoleChanged', ({ connectionId, role }) => {
      console.log('UserRoleChanged event received:', connectionId, 'role:', UserRole[role]);
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(user => 
          user.connectionId === connectionId 
            ? { ...user, role } 
            : user
        );
        console.log('Updated users after role change:', updatedUsers);
        return updatedUsers;
      });
      
      setCurrentUser(prev => {
        if (prev && prev.connectionId === connectionId) {
          console.log('Updating current user role to:', UserRole[role]);
          return { ...prev, role };
        }
        return prev;
      });
    });

    signalRService.on<Slide>('SlideAdded', (slide) => {
      console.log('SlideAdded event received:', slide);
      setPresentation(prev => {
        if (!prev) return prev;
        
        const updatedSlides = [...prev.slides, slide].sort((a, b) => a.order - b.order);
        return { ...prev, slides: updatedSlides };
      });
    });

    signalRService.on<number>('SlideRemoved', (slideId) => {
      console.log('SlideRemoved event received:', slideId);
      setPresentation(prev => {
        if (!prev) return prev;
        
        const updatedSlides = prev.slides.filter(slide => slide.id !== slideId);
        return { ...prev, slides: updatedSlides };
      });
      
      if (presentation?.slides[currentSlideIndex]?.id === slideId) {
        setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1));
      }
    });

    signalRService.on<SlideElement>('ElementAdded', (element) => {
      console.log('ElementAdded event received:', element);
      setPresentation(prev => {
        if (!prev) return prev;
        
        const updatedSlides = prev.slides.map(slide => 
          slide.id === element.slideId
            ? { ...slide, elements: [...slide.elements, element] }
            : slide
        );
        
        return { ...prev, slides: updatedSlides };
      });
    });

    signalRService.on<SlideElement>('ElementUpdated', (element) => {
      console.log('ElementUpdated event received:', element);
      setPresentation(prev => {
        if (!prev) return prev;
        
        const updatedSlides = prev.slides.map(slide => 
          slide.id === element.slideId
            ? { 
                ...slide, 
                elements: slide.elements.map(el => 
                  el.id === element.id ? element : el
                ) 
              }
            : slide
        );
        
        return { ...prev, slides: updatedSlides };
      });
      
      if (selectedElement && selectedElement.id === element.id) {
        setSelectedElement(element);
      }
    });

    signalRService.on<{id: number, positionX: number, positionY: number}>('ElementPositionUpdated', (update) => {
      console.log('ElementPositionUpdated event received:', update);
      setPresentation(prev => {
        if (!prev) return prev;
        
        return {
          ...prev,
          slides: prev.slides.map(slide => ({
            ...slide,
            elements: slide.elements.map(el => 
              el.id === update.id 
                ? { ...el, positionX: update.positionX, positionY: update.positionY } 
                : el
            )
          }))
        };
      });
    });

    signalRService.on<number>('ElementRemoved', (elementId) => {
      console.log('ElementRemoved event received:', elementId);
      setPresentation(prev => {
        if (!prev) return prev;
        
        const updatedSlides = prev.slides.map(slide => ({
          ...slide,
          elements: slide.elements.filter(el => el.id !== elementId)
        }));
        
        return { ...prev, slides: updatedSlides };
      });
      
      if (selectedElement && selectedElement.id === elementId) {
        setSelectedElement(null);
      }
    });

    signalRService.on<string>('Error', (errorMessage) => {
      console.error('Error from SignalR hub:', errorMessage);
      setIsError(errorMessage);
      
      setTimeout(() => {
        setIsError(null);
      }, 5000);
    });
  };

  const cleanupEventListeners = () => {
    signalRService.off('UserJoined', () => {});
    signalRService.off('UserLeft', () => {});
    signalRService.off('UserList', () => {});
    signalRService.off('UserRoleChanged', () => {});
    signalRService.off('SlideAdded', () => {});
    signalRService.off('SlideRemoved', () => {});
    signalRService.off('ElementAdded', () => {});
    signalRService.off('ElementUpdated', () => {});
    signalRService.off('ElementPositionUpdated', () => {});
    signalRService.off('ElementRemoved', () => {});
    signalRService.off('Error', () => {});
  };

  const handleAddSlide = async () => {
    if (!presentation) return;
    
    const newOrder = presentation.slides.length > 0 
      ? Math.max(...presentation.slides.map(s => s.order)) + 1 
      : 1;
    
    try {
      await signalRService.addSlide(newOrder);
    } catch (error) {
      console.error('Failed to add slide:', error);
      setIsError('Failed to add slide');
    }
  };

  const handleRemoveSlide = async () => {
    if (!presentation || presentation.slides.length === 0) return;
    
    const slideId = presentation.slides[currentSlideIndex].id;
    
    try {
      await signalRService.removeSlide(slideId);
    } catch (error) {
      console.error('Failed to remove slide:', error);
      setIsError('Failed to remove slide');
    }
  };

  const handleAddTextElement = async () => {
    if (!presentation || !presentation.slides[currentSlideIndex]) return;
    
    const slideId = presentation.slides[currentSlideIndex].id;
    
    const defaultX = 200;
    const defaultY = 200;
    
    const newElement: Partial<SlideElement> = {
      slideId,
      type: ElementType.Text,
      content: '# New Text\nClick to edit',
      positionX: defaultX,
      positionY: defaultY,
      width: 300,
      height: 100,
      color: '#000000',
      style: '{}'
    };
    
    try {
      await signalRService.addElement(newElement);
    } catch (error) {
      console.error('Failed to add text element:', error);
      setIsError('Failed to add text element');
    }
  };

  const handleAddRectangle = async () => {
    if (!presentation || !presentation.slides[currentSlideIndex]) return;
    
    const slideId = presentation.slides[currentSlideIndex].id;
    
    const defaultX = 200;
    const defaultY = 200;
    
    const newElement: Partial<SlideElement> = {
      slideId,
      type: ElementType.Rectangle,
      content: '',
      positionX: defaultX,
      positionY: defaultY,
      width: 150,
      height: 100,
      color: '#3498db',
      style: '{}'
    };
    
    try {
      await signalRService.addElement(newElement);
    } catch (error) {
      console.error('Failed to add rectangle:', error);
      setIsError('Failed to add rectangle');
    }
  };

  const handleAddCircle = async () => {
    if (!presentation || !presentation.slides[currentSlideIndex]) return;
    
    const slideId = presentation.slides[currentSlideIndex].id;
    
    const defaultX = 200;
    const defaultY = 200;
    
    const newElement: Partial<SlideElement> = {
      slideId,
      type: ElementType.Circle,
      content: '',
      positionX: defaultX,
      positionY: defaultY,
      width: 100,
      height: 100,
      color: '#e74c3c',
      style: '{}'
    };
    
    try {
      await signalRService.addElement(newElement);
    } catch (error) {
      console.error('Failed to add circle:', error);
      setIsError('Failed to add circle');
    }
  };

  const handleAddImage = async () => {
    if (!presentation || !presentation.slides[currentSlideIndex]) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        
        const slideId = presentation.slides[currentSlideIndex].id;
        const newElement: Partial<SlideElement> = {
          slideId,
          type: ElementType.Image,
          content: dataUrl,
          positionX: 200,
          positionY: 200,
          width: 300,
          height: 200,
          color: '#000000',
          style: '{}'
        };
        
        try {
          await signalRService.addElement(newElement);
        } catch (error) {
          console.error('Failed to add image:', error);
          setIsError('Failed to add image');
        }
      };
      
      reader.readAsDataURL(file);
    };
    
    input.click();
  };

  const handleElementClick = (element: SlideElement) => {
    if (currentUser?.role === UserRole.Viewer) return;
    
    setSelectedElement(element);
    
    if (element.type === ElementType.Text) {
      setEditingText(element.content);
    }
  };

  const handleSlideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (selectedElement?.type === ElementType.Text && editingText !== selectedElement.content) {
        const confirmSave = window.confirm('Сохранить изменения текста?');
        if (confirmSave) {
          handleTextSave();
        }
      }
      
      setSelectedElement(null);
      setEditingText('');
    }
  };

  const handleElementMove = async (element: SlideElement, deltaX: number, deltaY: number) => {
    if (currentUser?.role === UserRole.Viewer) return;
    
    const newPositionX = element.positionX + deltaX;
    const newPositionY = element.positionY + deltaY;
    
    setPresentation(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        slides: prev.slides.map(slide => {
          if (slide.id !== element.slideId) return slide;
          
          return {
            ...slide,
            elements: slide.elements.map(el => {
              if (el.id !== element.id) return el;
              
              return {
                ...el,
                positionX: newPositionX,
                positionY: newPositionY
              };
            })
          };
        })
      };
    });
    
    try {
      await signalRService.updateElementPosition(element.id, newPositionX, newPositionY);
    } catch (error) {
      console.error('Failed to move element:', error);
    }
  };

  const handleTextSave = async () => {
    if (!selectedElement) return;
    
    const updatedElement: SlideElement = {
      ...selectedElement,
      content: editingText
    };
    
    try {
      await signalRService.updateElement(updatedElement);
      setSelectedElement(null);
      setEditingText('');
    } catch (error) {
      console.error('Failed to update text:', error);
      setIsError('Failed to update text');
    }
  };

  const handleDeleteElement = async () => {
    if (!selectedElement) return;
    
    try {
      await signalRService.removeElement(selectedElement.id);
      setSelectedElement(null);
    } catch (error) {
      console.error('Failed to delete element:', error);
      setIsError('Failed to delete element');
    }
  };

  const handleChangeUserRole = async (connectionId: string, newRole: UserRole) => {
    try {
      await signalRService.changeUserRole(connectionId, newRole);
    } catch (error) {
      console.error('Failed to change user role:', error);
      setIsError('Failed to change user role');
    }
  };

  const handleStartPresentation = () => {
    setIsPresenting(true);
  };

  const handleExitPresentation = () => {
    setIsPresenting(false);
  };

  const handleChangeSlide = (index: number) => {
    if (index >= 0 && presentation && index < presentation.slides.length) {
      setCurrentSlideIndex(index);
    }
  };

  const handleDisconnect = async () => {
    try {
      await signalRService.disconnect();
      navigate('/');
    } catch (error) {
      console.error('Error disconnecting:', error);
      navigate('/');
    }
  };

  const parseMarkdown = (content: string): string => {
    try {
      return marked.parse(content, { async: false }) as string;
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return content;
    }
  };

  const renderElement = (element: SlideElement, isSelected: boolean) => {
    const style = {
      position: 'absolute' as const,
      left: `${element.positionX}px`,
      top: `${element.positionY}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
      color: element.type === ElementType.Text ? element.color : undefined,
      backgroundColor: 
        element.type === ElementType.Rectangle || element.type === ElementType.Circle 
          ? element.color 
          : undefined,
      borderRadius: element.type === ElementType.Circle ? '50%' : undefined,
      border: isSelected ? '2px dashed #2ecc71' : 'none',
      cursor: currentUser?.role !== UserRole.Viewer ? 'move' : 'default',
      overflow: 'hidden',
      userSelect: 'none' as const
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      if (currentUser?.role === UserRole.Viewer) return;
      
      const startX = e.clientX;
      const startY = e.clientY;
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        
        handleElementMove(element, deltaX, deltaY);
        
        moveEvent.preventDefault();
      };
      
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      e.stopPropagation();
    };

    switch (element.type) {
      case ElementType.Text:
        return (
          <div
            style={style}
            onClick={() => handleElementClick(element)}
            onMouseDown={handleMouseDown}
          >
            <div dangerouslySetInnerHTML={{ __html: parseMarkdown(element.content) }} />
          </div>
        );
      
      case ElementType.Rectangle:
      case ElementType.Circle:
        return (
          <div
            style={style}
            onClick={() => handleElementClick(element)}
            onMouseDown={handleMouseDown}
          />
        );
      
      case ElementType.Image:
        return (
          <div
            style={style}
            onClick={() => handleElementClick(element)}
            onMouseDown={handleMouseDown}
          >
            <img 
              src={element.content} 
              alt="Slide element" 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  if (!presentation || !isConnected || !isInitialized) {
    return (
      <div className="loading">
        <h2>Loading presentation...</h2>
        <p>{connectionStatus}</p>
        {isError && <div className="error-message">{isError}</div>}
      </div>
    );
  }

  if (isPresenting) {
    const currentSlide = presentation.slides[currentSlideIndex];
    
    return (
      <div className="presentation-mode">
        <div className="slide-container">
          {currentSlide ? (
            <div className="slide">
              {currentSlide.elements.map((element) => (
                <div key={element.id}>
                  {renderElement(element, false)}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-slide">No slide content</div>
          )}
        </div>
        
        <div className="presentation-controls">
          <button 
            onClick={() => handleChangeSlide(currentSlideIndex - 1)}
            disabled={currentSlideIndex === 0}
          >
            Previous
          </button>
          <span>{currentSlideIndex + 1} / {presentation.slides.length}</span>
          <button 
            onClick={() => handleChangeSlide(currentSlideIndex + 1)}
            disabled={currentSlideIndex === presentation.slides.length - 1}
          >
            Next
          </button>
          <button onClick={handleExitPresentation} className="exit-btn">
            Exit Presentation
          </button>
        </div>
      </div>
    );
  }

  const userRole: UserRole = currentUser?.role ?? UserRole.Viewer;
  const userHasCreatorPermission = userRole === UserRole.Creator;
  const userHasEditorPermission = userHasCreatorPermission || userRole === UserRole.Editor;

  return (
    <div className="editor-container">
      <header className="editor-header">
        <h1>{presentation.title}</h1>
        <div className="role-indicator">
          {currentUser && currentUser.role === UserRole.Creator && (
            <span className="creator-badge">Creator</span>
          )}
        </div>
        <div className="header-controls">
          <button 
            onClick={handleStartPresentation}
            className="present-btn"
          >
            Present
          </button>
          <button 
            onClick={handleDisconnect}
            className="exit-btn"
          >
            Exit
          </button>
        </div>
      </header>

      <div className="editor-content">
        <div className="slides-panel">
          <div className="slides-list">
            {presentation.slides.map((slide, index) => (
              <div 
                key={slide.id}
                className={`slide-thumbnail ${index === currentSlideIndex ? 'active' : ''}`}
                onClick={() => handleChangeSlide(index)}
              >
                <span>Slide {index + 1}</span>
              </div>
            ))}
          </div>
          
          {userHasCreatorPermission && (
            <div className="slide-controls">
              <button onClick={handleAddSlide}>Add Slide</button>
              <button 
                onClick={handleRemoveSlide}
                disabled={presentation.slides.length <= 1}
              >
                Remove Slide
              </button>
            </div>
          )}
        </div>

        <div className="editor-main" ref={editorRef}>
          {presentation.slides.length > 0 ? (
            <div className="slide-editor" onClick={handleSlideClick}>
              {presentation.slides[currentSlideIndex]?.elements.map((element) => (
                <div key={element.id}>
                  {renderElement(element, selectedElement?.id === element.id)}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-editor">
              <p>No slides yet. Add one to get started!</p>
            </div>
          )}
        </div>

        <div className="right-panel">
          {userHasEditorPermission && (
            <div className="tools-panel">
              <h3>Tools</h3>
              <div className="tool-buttons">
                <button onClick={handleAddTextElement}>Add Text</button>
                <button onClick={handleAddRectangle}>Add Rectangle</button>
                <button onClick={handleAddCircle}>Add Circle</button>
                <button onClick={handleAddImage}>Add Image</button>
                {selectedElement && (
                  <button onClick={handleDeleteElement} className="delete-btn">
                    Delete Selected
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedElement && selectedElement.type === ElementType.Text && userHasEditorPermission && (
            <div className="element-editor">
              <h3>Edit Text</h3>
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="Enter markdown text..."
                rows={8}
              />
              <div className="editor-actions">
                <button onClick={() => setSelectedElement(null)}>Cancel</button>
                <button onClick={handleTextSave}>Save</button>
              </div>
              <div className="markdown-help">
                <p>Markdown supported:</p>
                <code># Heading</code>
                <code>**Bold**</code>
                <code>*Italic*</code>
                <code>- List item</code>
              </div>
            </div>
          )}

          <div className="users-panel">
            <h3>Users ({users.length})</h3>
            {users.length === 0 ? (
              <div className="no-users-message">
                <p>No other users connected</p>
                <p>You are logged in as: <strong>{nickname}</strong></p>
                <p className="user-status">
                  Status: <span className={`user-role ${userRole.toString().toLowerCase()}`}>
                    {UserRole[userRole]}
                  </span>
                </p>
              </div>
            ) : (
              <ul className="user-list">
                {users.map((user) => (
                  <li key={user.connectionId} className={`user-item ${user.connectionId === currentUser?.connectionId ? 'current-user' : ''}`}>
                    <span className="user-name">{user.nickname}</span>
                    <span className={`user-role ${UserRole[user.role].toLowerCase()}`}>
                      {UserRole[user.role]}
                    </span>
                    
                    {userHasCreatorPermission && 
                    user.connectionId !== currentUser?.connectionId && (
                      <div className="role-controls">
                        <button 
                          onClick={() => handleChangeUserRole(user.connectionId, UserRole.Editor)}
                          disabled={user.role === UserRole.Editor}
                          className={user.role === UserRole.Editor ? 'active' : ''}
                        >
                          Editor
                        </button>
                        <button 
                          onClick={() => handleChangeUserRole(user.connectionId, UserRole.Viewer)}
                          disabled={user.role === UserRole.Viewer}
                          className={user.role === UserRole.Viewer ? 'active' : ''}
                        >
                          Viewer
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {isError && (
        <div className="error-notification">
          {isError}
        </div>
      )}
    </div>
  );
};