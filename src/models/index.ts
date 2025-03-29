export interface Presentation {
  id: number;
  title: string;
  author: string;
  uploadDate: string;
  slides: Slide[];
}

export interface Slide {
  id: number;
  presentationId: number;
  order: number;
  elements: SlideElement[];
}

export enum ElementType {
  Text = 0,
  Rectangle = 1,
  Circle = 2,
  Image = 3
}

export interface SlideElement {
  id: number;
  slideId: number;
  type: ElementType;
  content: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  color: string;
  style: string;
}

export enum UserRole {
  Creator = 0,
  Editor = 1,
  Viewer = 2
}

export interface PresentationUser {
  connectionId: string;
  nickname: string;
  presentationId: number;
  role: UserRole;
}