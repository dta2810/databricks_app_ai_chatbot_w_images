import type { VisualizationSpec } from 'vega-embed';

/**
 * SQL-like result format returned by Databricks tools
 */
interface SQLResultFormat {
  columns: string[];
  rows: unknown[][];
  is_truncated?: boolean;
}

/**
 * Checks if the given object is a valid Vega or Vega-Lite specification
 */
function isVegaSpec(obj: unknown): obj is VisualizationSpec {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const spec = obj as Record<string, unknown>;
  
  // Check for Vega-Lite schema
  if (typeof spec.$schema === 'string') {
    return (
      spec.$schema.includes('vega-lite') ||
      spec.$schema.includes('vega.github.io')
    );
  }

  // Also accept specs without $schema but with required Vega-Lite fields
  return (
    ('mark' in spec || 'layer' in spec || 'concat' in spec) &&
    ('data' in spec || 'datasets' in spec)
  );
}

/**
 * Attempts to parse a Vega-Lite spec from various formats
 */
export function parseVegaSpec(output: unknown): VisualizationSpec | null {
  console.log('🔍 [parseVegaSpec] ========== START ==========');
  console.log('🔍 [parseVegaSpec] Input type:', typeof output);
  console.log('🔍 [parseVegaSpec] Input value (truncated):', 
    typeof output === 'string' ? output.substring(0, 200) + '...' : output);
  
  try {
    // Case 1: Already a Vega spec object
    if (isVegaSpec(output)) {
      console.log('✅ [parseVegaSpec] Case 1: Already a Vega spec');
      return output as VisualizationSpec;
    }

    // Case 2: SQL result format (from Databricks tools)
    if (
      typeof output === 'object' &&
      output !== null &&
      'rows' in output &&
      'columns' in output
    ) {
      console.log('📊 [parseVegaSpec] Case 2: SQL result format detected');
      const sqlResult = output as SQLResultFormat;
      console.log('📊 [parseVegaSpec] SQL columns:', sqlResult.columns);
      console.log('📊 [parseVegaSpec] SQL rows length:', sqlResult.rows.length);
      
      // Extract the first row, first column
      if (sqlResult.rows.length > 0 && sqlResult.rows[0].length > 0) {
        const firstValue = sqlResult.rows[0][0];
        console.log('📊 [parseVegaSpec] First value type:', typeof firstValue);
        console.log('📊 [parseVegaSpec] First value preview:', 
          typeof firstValue === 'string' ? firstValue.substring(0, 150) + '...' : firstValue);
        
        // If it's a string, try to parse it as JSON
        if (typeof firstValue === 'string') {
          try {
            const parsed = JSON.parse(firstValue);
            console.log('📊 [parseVegaSpec] Parsed from string, checking if Vega spec...');
            if (isVegaSpec(parsed)) {
              console.log('✅ [parseVegaSpec] Successfully parsed Vega spec from SQL result!');
              return parsed as VisualizationSpec;
            } else {
              console.log('❌ [parseVegaSpec] Parsed JSON is not a Vega spec');
            }
          } catch (e) {
            console.log('❌ [parseVegaSpec] Failed to parse JSON:', e);
          }
        }
        
        // If it's already an object, check if it's a spec
        if (isVegaSpec(firstValue)) {
          console.log('✅ [parseVegaSpec] First value is already a Vega spec!');
          return firstValue as VisualizationSpec;
        }
      } else {
        console.log('❌ [parseVegaSpec] SQL result has no rows or empty rows');
      }
    }

    // Case 3: String containing JSON
    if (typeof output === 'string') {
      console.log('📝 [parseVegaSpec] Case 3: String input');
      try {
        const parsed = JSON.parse(output);
        console.log('📝 [parseVegaSpec] Parsed string to:', typeof parsed);
        
        // Check if it's directly a Vega spec
        if (isVegaSpec(parsed)) {
          console.log('✅ [parseVegaSpec] Successfully parsed Vega spec from string!');
          return parsed as VisualizationSpec;
        }
        
        // Check if the parsed string is actually the SQL result format
        // Recursively call parseVegaSpec on the parsed object
        console.log('📝 [parseVegaSpec] Not a direct Vega spec, recursing...');
        return parseVegaSpec(parsed);
      } catch (e) {
        console.log('❌ [parseVegaSpec] Not valid JSON string:', e);
      }
    }

    console.log('❌ [parseVegaSpec] No Vega spec detected');
    console.log('🔍 [parseVegaSpec] ========== END ==========');
    return null;
  } catch (error) {
    console.error('❌ [parseVegaSpec] Error:', error);
    console.log('🔍 [parseVegaSpec] ========== END (ERROR) ==========');
    return null;
  }
}

/**
 * Checks if tool output contains a Vega-Lite specification
 */
export function isVegaLiteOutput(output: unknown): boolean {
  return parseVegaSpec(output) !== null;
}
