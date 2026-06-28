
import { useState, useCallback } from 'react';
import { RateLimiter } from '@/lib/validation';
import { useToast } from '@/hooks/use-toast';

const rateLimiter = new RateLimiter();

interface UseSecureRequestOptions {
  rateLimitKey: string;
  windowMs: number;
  maxRequests: number;
  onError?: (error: Error) => void;
}

export function useSecureRequest<T extends unknown[], R>(
  requestFn: (...args: T) => Promise<R>,
  options: UseSecureRequestOptions
) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const execute = useCallback(async (...args: T): Promise<R | null> => {
    // Rate limiting check
    if (!rateLimiter.canMakeRequest(options.rateLimitKey, options.windowMs, options.maxRequests)) {
      const remainingTime = rateLimiter.getRemainingTime(options.rateLimitKey, options.windowMs);
      const seconds = Math.ceil(remainingTime / 1000);
      
      toast({
        title: "Rate Limit Exceeded",
        description: `Please wait ${seconds} seconds before trying again.`,
        variant: "destructive",
      });
      return null;
    }

    setIsLoading(true);
    try {
      const result = await requestFn(...args);
      return result;
    } catch (error) {
      console.error(`Secure request error for ${options.rateLimitKey}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      // Don't expose sensitive error details
      const sanitizedMessage = errorMessage.includes('API key') 
        ? 'Authentication error. Please check your configuration.'
        : errorMessage.includes('network')
        ? 'Network error. Please check your connection.'
        : 'Request failed. Please try again.';

      toast({
        title: "Request Failed",
        description: sanitizedMessage,
        variant: "destructive",
      });

      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(errorMessage));
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [requestFn, options, toast]);

  return { execute, isLoading };
}
