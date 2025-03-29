import * as signalR from '@microsoft/signalr';
import { 
  Presentation, Slide, SlideElement, PresentationUser, UserRole 
} from '../models';

const HUB_URL = 'https://presentationssoftware.runasp.net/presentationHub';

export class SignalRService {
  private hubConnection: signalR.HubConnection | null = null;
  private presentationId: number | null = null;
  private eventHandlers: { [event: string]: ((data: any) => void)[] } = {};
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private connectionPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.connectionState === 'connected' && this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      return Promise.resolve();
    }

    this.connectionState = 'connecting';
    console.log('Connecting to SignalR hub...');
    
    this.connectionPromise = new Promise<void>(async (resolve, reject) => {
      try {
        this.hubConnection = new signalR.HubConnectionBuilder()
          .withUrl(HUB_URL)
          .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
          .configureLogging(signalR.LogLevel.Information)
          .build();

        this.hubConnection.onreconnecting((error) => {
          console.log('Attempting to reconnect to SignalR hub...', error);
          this.connectionState = 'connecting';
        });

        this.hubConnection.onreconnected(() => {
          console.log('Reconnected to SignalR hub');
          this.connectionState = 'connected';
          
          if (this.presentationId) {
            const nickname = localStorage.getItem('nickname') || 'User';
            this.joinPresentation(this.presentationId, nickname).catch(console.error);
          }
        });

        this.hubConnection.onclose((error) => {
          console.log('Connection closed', error);
          this.connectionState = 'disconnected';
          this.connectionPromise = null;
        });

        await this.hubConnection.start();
        console.log('Connected to SignalR hub');
        
        this.registerClientMethods();
        
        this.connectionState = 'connected';
        resolve();
      } catch (error) {
        this.connectionState = 'error';
        console.error('Error connecting to SignalR hub:', error);
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  getConnectionState(): 'disconnected' | 'connecting' | 'connected' | 'error' {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && 
           this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  async joinPresentation(presentationId: number, nickname: string, isCreator: boolean = false): Promise<void> {
    // Ensure connected before joining
    await this.ensureConnected();
  
    if (!this.isConnected()) {
      throw new Error('Cannot join presentation: SignalR connection is not established');
    }
  
    this.presentationId = presentationId;
    
    try {
      console.log(`Attempting to join presentation ${presentationId} as ${nickname}, isCreator: ${isCreator}`);
      await this.hubConnection!.invoke('JoinPresentation', presentationId, nickname, isCreator);
      console.log(`Joined presentation ${presentationId} as ${nickname}`);
    } catch (error) {
      console.error('Error joining presentation:', error);
      throw error;
    }
  }

  async changeUserRole(connectionId: string, newRole: UserRole): Promise<void> {
    await this.ensureConnected();

    try {
      await this.hubConnection!.invoke('ChangeUserRole', connectionId, newRole);
    } catch (error) {
      console.error('Error changing user role:', error);
      throw error;
    }
  }

  async addSlide(order: number): Promise<void> {
    await this.ensureConnected();
    
    if (!this.presentationId) {
      throw new Error('Not in a presentation');
    }

    try {
      await this.hubConnection!.invoke('AddSlide', this.presentationId, order);
    } catch (error) {
      console.error('Error adding slide:', error);
      throw error;
    }
  }

  async removeSlide(slideId: number): Promise<void> {
    await this.ensureConnected();

    try {
      await this.hubConnection!.invoke('RemoveSlide', slideId);
    } catch (error) {
      console.error('Error removing slide:', error);
      throw error;
    }
  }

  async addElement(element: Partial<SlideElement>): Promise<void> {
    await this.ensureConnected();

    try {
      await this.hubConnection!.invoke('AddElement', element);
    } catch (error) {
      console.error('Error adding element:', error);
      throw error;
    }
  }

  async updateElement(element: SlideElement): Promise<void> {
    await this.ensureConnected();

    try {
      await this.hubConnection!.invoke('UpdateElement', element);
    } catch (error) {
      console.error('Error updating element:', error);
      throw error;
    }
  }
  
  async updateElementPosition(elementId: number, positionX: number, positionY: number): Promise<void> {
    await this.ensureConnected();

    try {
      await this.hubConnection!.invoke('UpdateElementPosition', elementId, positionX, positionY);
    } catch (error) {
      console.error('Error updating element position:', error);
      throw error;
    }
  }

  async removeElement(elementId: number): Promise<void> {
    await this.ensureConnected();

    try {
      await this.hubConnection!.invoke('RemoveElement', elementId);
    } catch (error) {
      console.error('Error removing element:', error);
      throw error;
    }
  }

  on<T>(event: string, callback: (data: T) => void): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (handler) => handler !== callback
      );
    }
  }

  private registerClientMethods(): void {
    if (!this.hubConnection) return;

    // User events
    this.hubConnection.on('UserJoined', (user: PresentationUser) => {
      console.log('User joined:', user);
      this.triggerEvent('UserJoined', user);
    });

    this.hubConnection.on('UserLeft', (connectionId: string) => {
      console.log('User left:', connectionId);
      this.triggerEvent('UserLeft', connectionId);
    });

    this.hubConnection.on('UserList', (users: PresentationUser[]) => {
      console.log('User list received:', users);
      this.triggerEvent('UserList', users);
    });

    this.hubConnection.on('UserRoleChanged', (connectionId: string, role: UserRole) => {
      console.log('User role changed:', connectionId, role);
      this.triggerEvent('UserRoleChanged', { connectionId, role });
    });

    // Slide events
    this.hubConnection.on('SlideAdded', (slide: Slide) => {
      console.log('Slide added:', slide);
      this.triggerEvent('SlideAdded', slide);
    });

    this.hubConnection.on('SlideRemoved', (slideId: number) => {
      console.log('Slide removed:', slideId);
      this.triggerEvent('SlideRemoved', slideId);
    });

    // Element events
    this.hubConnection.on('ElementAdded', (element: SlideElement) => {
      console.log('Element added:', element);
      this.triggerEvent('ElementAdded', element);
    });

    this.hubConnection.on('ElementUpdated', (element: SlideElement) => {
      console.log('Element updated:', element);
      this.triggerEvent('ElementUpdated', element);
    });
    
    this.hubConnection.on('ElementPositionUpdated', (update: {id: number, positionX: number, positionY: number}) => {
      console.log('Element position updated:', update);
      this.triggerEvent('ElementPositionUpdated', update);
    });

    this.hubConnection.on('ElementRemoved', (elementId: number) => {
      console.log('Element removed:', elementId);
      this.triggerEvent('ElementRemoved', elementId);
    });

    // Error event
    this.hubConnection.on('Error', (errorMessage: string) => {
      console.error('Error from SignalR hub:', errorMessage);
      this.triggerEvent('Error', errorMessage);
    });
  }

  private triggerEvent(event: string, data: any): void {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      try {
        if (this.isConnected()) {
          await this.hubConnection.invoke('LeavePresentation');
        }

        await this.hubConnection.stop();
        console.log('Disconnected from SignalR hub');
      } catch (error) {
        console.error('Error disconnecting from SignalR hub:', error);
      } finally {
        this.hubConnection = null;
        this.presentationId = null;
        this.connectionState = 'disconnected';
        this.connectionPromise = null;
      }
    }
  }
}

export const signalRService = new SignalRService();