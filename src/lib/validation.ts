
import { z } from 'zod';

// Character validation schema
export const characterSchema = z.object({
  name: z.string()
    .min(1, 'Character name is required')
    .max(50, 'Character name must be 50 characters or less')
    .regex(/^[A-Za-z\s\-'.]+$/, 'Character name can only contain letters, spaces, hyphens, apostrophes, and periods'),
  voice: z.string()
    .min(1, 'Voice ID is required')
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid voice ID format'),
  isUserRole: z.boolean()
});

// Script validation schema
export const scriptSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(100, 'Title must be 100 characters or less')
    .trim(),
  content: z.string()
    .min(1, 'Content is required')
    .max(50000, 'Content must be 50,000 characters or less')
});

// Voice ID validation
export const voiceIdSchema = z.string()
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid voice ID format');

// TTS request validation
export const ttsRequestSchema = z.object({
  text: z.string()
    .min(1, 'Text is required')
    .max(5000, 'Text must be 5000 characters or less'),
  voice_id: voiceIdSchema.optional()
});

// Sanitize HTML content
export const sanitizeHtml = (html: string): string => {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Allow only specific tags for script formatting
  const allowedTags = ['p', 'br', 'strong', 'em', 'b', 'i'];
  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const element = node as Element;
        return allowedTags.includes(element.tagName.toLowerCase()) 
          ? NodeFilter.FILTER_ACCEPT 
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const elementsToRemove: Element[] = [];
  let currentNode = walker.nextNode();
  
  while (currentNode) {
    const element = currentNode as Element;
    if (!allowedTags.includes(element.tagName.toLowerCase())) {
      elementsToRemove.push(element);
    }
    currentNode = walker.nextNode();
  }

  // Remove disallowed elements
  elementsToRemove.forEach(element => {
    if (element.parentNode) {
      // Replace with text content to preserve content
      const textNode = document.createTextNode(element.textContent || '');
      element.parentNode.replaceChild(textNode, element);
    }
  });

  return tempDiv.innerHTML;
};

// Rate limiting helper
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  canMakeRequest(key: string, windowMs: number, maxRequests: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  getRemainingTime(key: string, windowMs: number): number {
    const requests = this.requests.get(key) || [];
    if (requests.length === 0) return 0;
    
    const oldestRequest = Math.min(...requests);
    const timeUntilReset = windowMs - (Date.now() - oldestRequest);
    return Math.max(0, timeUntilReset);
  }
}

// Input sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

// Validate character name format (matches script parsing)
export const validateCharacterName = (name: string): boolean => {
  return /^[A-Za-z][A-Za-z\s\-'.]*[A-Za-z]?$/.test(name);
};
