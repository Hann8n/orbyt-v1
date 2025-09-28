/**
 * Custom Lexicon Schemas for Orbyt
 * 
 * This file defines custom schemas that extend the AT Protocol
 * to support Orbyt-specific features like custom profile colors.
 */

export const CUSTOM_PROFILE_SCHEMA = {
  lexicon: 1,
  id: 'com.orbyt.app/profile',
  defs: {
    main: {
      type: 'record',
      record: {
        type: 'object',
        properties: {
          displayName: { 
            type: 'string',
            maxLength: 64
          },
          description: { 
            type: 'string',
            maxLength: 256
          },
          avatar: { 
            type: 'blob'
          },
          // Custom Orbyt fields
          customColors: {
            type: 'object',
            properties: {
              backgroundColor: { 
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$'
              },
              textColor: { 
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$'
              }
            },
            required: ['backgroundColor', 'textColor']
          }
        }
      }
    }
  }
};

export const CUSTOM_PROFILE_COLORS_SCHEMA = {
  lexicon: 1,
  id: 'com.orbyt.app/profileColors',
  defs: {
    main: {
      type: 'record',
      record: {
        type: 'object',
        properties: {
          backgroundColor: { 
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$'
          },
          textColor: { 
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$'
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        },
        required: ['backgroundColor', 'textColor', 'createdAt', 'updatedAt']
      }
    }
  }
};

// Type definitions for custom profile colors
export interface CustomProfileColors {
  backgroundColor: string;
  textColor: string;
}

export interface CustomProfileRecord {
  displayName?: string;
  description?: string;
  avatar?: any; // Blob reference
  customColors?: CustomProfileColors;
}

export interface CustomProfileColorsRecord {
  backgroundColor: string;
  textColor: string;
  createdAt: string;
  updatedAt: string;
}
