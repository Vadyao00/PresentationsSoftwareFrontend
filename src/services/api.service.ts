import axios from 'axios';
import { Presentation } from '../models';

const API_URL = 'https://presentationssoftware.runasp.net/api';

export const apiService = {
  getPresentations: async (): Promise<Presentation[]> => {
    const response = await axios.get<Presentation[]>(`${API_URL}/presentations`);
    return response.data;
  },

  getPresentation: async (id: number): Promise<Presentation> => {
    const response = await axios.get<Presentation>(`${API_URL}/presentations/${id}`);
    return response.data;
  },

  createPresentation: async (presentation: Partial<Presentation>): Promise<Presentation> => {
    const response = await axios.post<Presentation>(`${API_URL}/presentations`, presentation);
    return response.data;
  }
};