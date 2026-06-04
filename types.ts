export enum LoadingState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface PlantCare {
  light: string;
  water: string;
  soil: string;
  temperature: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface PlantHealth {
  status: 'Healthy' | 'Sick';
  issues: string[];
  recommendations: string[];
}

export interface PlantData {
  isPlant: boolean;
  name: string;
  scientificName: string;
  description: string;
  care: PlantCare;
  funFacts: string[];
  health: PlantHealth;
  treatment: string;
  ozon_search_term: string;
  image_url?: string;
}

// Helper type for the raw file input
export interface ImageFile {
  file: File;
  previewUrl: string;
}
