import { useAuth } from "@/contexts/AuthContext";

/**
 * Centralized hook for managing brand colors throughout the application
 * All theme colors should be managed through this hook for easy maintenance
 */
export function useBrandColor() {
  const { currentOrganization, isSuperAdmin } = useAuth();

  // Super admin without organization gets dark blue theme
  // Otherwise use organization's brand color or default yellow
  const brandColor = isSuperAdmin && !currentOrganization
    ? '#001D39'
    : currentOrganization?.organizations?.brand_color || '#eab308';

  const brandColor2 = currentOrganization?.organizations?.brand_color_2 || '#6b7280';
  const brandColor3 = currentOrganization?.organizations?.brand_color_3 || '#94a3b8';

  /**
   * Get color with opacity for hover effects
   * @param opacity - Opacity value (0-100)
   */
  const getBrandColorWithOpacity = (opacity: number): string => {
    // Convert hex to rgba with opacity
    const hex = brandColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  };

  /**
   * Get color with hex opacity suffix for CSS
   * @param opacity - Opacity percentage (10, 15, 20, 40, 60, 66, etc.)
   */
  const getBrandColorHex = (opacity: number): string => {
    const hexOpacity = Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');
    return `${brandColor}${hexOpacity}`;
  };

  return {
    brandColor,
    brandColor2,
    brandColor3,
    getBrandColorWithOpacity,
    getBrandColorHex,
  };
}
