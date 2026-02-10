def process_structured_data(
    data_sample: str,
    processing_instruction: str = "auto"
) -> str:
    """
    Intelligently process and analyze structured data from agents.
    
    This function can:
    - Auto-detect the best visualization type
    - Format data for optimal presentation
    - Generate insights and statistics
    - Create appropriate visualizations
    
    Args:
        data_sample (str): JSON string array of objects or SQL result format
        processing_instruction (str): How to process the data:
            - "auto": Automatically determine best processing
            - "visualize": Force visualization generation
            - "summarize": Generate summary statistics
            - "format": Format for display
            - "chart:line", "chart:bar", etc.: Specific chart type
    
    Returns:
        str: JSON string containing processed output with visualization or formatted data
    """
    import json
    import re
    from typing import Any, Dict, List, Union
    
    # ====== HELPER FUNCTIONS ======
    
    def parse_input_data(data_sample: str) -> List[Dict[str, Any]]:
        """Parse various input formats into a normalized list of dicts."""
        if not data_sample or not data_sample.strip():
            return []
        
        try:
            parsed = json.loads(data_sample)
            
            # Handle SQL result format: {columns: [...], rows: [[...]]}
            if isinstance(parsed, dict) and "columns" in parsed and "rows" in parsed:
                columns = parsed["columns"]
                rows = parsed["rows"]
                return [dict(zip(columns, row)) for row in rows]
            
            # Handle direct array of objects
            elif isinstance(parsed, list):
                return parsed
            
            # Handle single object
            elif isinstance(parsed, dict):
                return [parsed]
            
        except (json.JSONDecodeError, TypeError):
            pass
        
        return []
    
    def analyze_data_structure(data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze data to determine field types and characteristics."""
        if not data:
            return {
                "row_count": 0,
                "fields": [],
                "numeric_fields": [],
                "text_fields": [],
                "date_fields": [],
                "category_fields": [],
                "has_time_series": False,
                "has_categories": False,
                "recommended_viz": None
            }
        
        first_item = data[0]
        fields = list(first_item.keys())
        
        numeric_fields = []
        text_fields = []
        date_fields = []
        category_fields = []
        
        for field in fields:
            field_lower = field.lower()
            
            # Check field name patterns
            if any(keyword in field_lower for keyword in ['year', 'date', 'time', 'month', 'day', 'quarter']):
                date_fields.append(field)
            elif any(keyword in field_lower for keyword in ['name', 'region', 'category', 'type', 'brand', 'segment', 'id']):
                category_fields.append(field)
            
            # Check actual data types
            try:
                sample_value = data[0][field]
                if isinstance(sample_value, (int, float)) and not isinstance(sample_value, bool):
                    numeric_fields.append(field)
                elif isinstance(sample_value, str):
                    # Check if it's a date string
                    if re.match(r'^\d{4}(-\d{2})?(-\d{2})?', str(sample_value)):
                        if field not in date_fields:
                            date_fields.append(field)
                    else:
                        text_fields.append(field)
                        # Check if it's a category (limited unique values)
                        unique_values = len(set(str(row.get(field, '')) for row in data))
                        if unique_values <= max(10, len(data) * 0.5):  # Heuristic for categorical
                            if field not in category_fields:
                                category_fields.append(field)
            except:
                pass
        
        # Determine visualization recommendation
        has_time_series = len(date_fields) > 0
        has_categories = len(category_fields) > 0
        has_numeric = len(numeric_fields) > 0
        
        recommended_viz = None
        if has_time_series and has_numeric:
            recommended_viz = "line"  # Time series chart
        elif has_categories and has_numeric and len(data) <= 20:
            recommended_viz = "bar"  # Bar chart for categorical data
        elif has_numeric and len(numeric_fields) >= 2:
            recommended_viz = "scatter"  # Scatter plot for correlation
        elif has_categories and has_numeric:
            recommended_viz = "bar"  # Default to bar
        
        return {
            "row_count": len(data),
            "fields": fields,
            "numeric_fields": numeric_fields,
            "text_fields": text_fields,
            "date_fields": date_fields,
            "category_fields": category_fields,
            "has_time_series": has_time_series,
            "has_categories": has_categories,
            "has_numeric": has_numeric,
            "recommended_viz": recommended_viz
        }
    
    def generate_summary_stats(data: List[Dict[str, Any]], analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Generate summary statistics for the data."""
        stats = {
            "row_count": analysis["row_count"],
            "column_count": len(analysis["fields"]),
            "numeric_columns": len(analysis["numeric_fields"]),
            "text_columns": len(analysis["text_fields"]),
            "field_stats": {}
        }
        
        # Calculate stats for numeric fields
        for field in analysis["numeric_fields"]:
            values = [row[field] for row in data if field in row and isinstance(row[field], (int, float))]
            if values:
                stats["field_stats"][field] = {
                    "type": "numeric",
                    "min": min(values),
                    "max": max(values),
                    "avg": sum(values) / len(values),
                    "count": len(values)
                }
        
        # Calculate stats for categorical fields
        for field in analysis["category_fields"]:
            values = [str(row[field]) for row in data if field in row]
            unique_values = list(set(values))
            stats["field_stats"][field] = {
                "type": "categorical",
                "unique_count": len(unique_values),
                "values": unique_values[:10],  # First 10 unique values
                "count": len(values)
            }
        
        return stats
    
    def generate_vega_lite_spec(data: List[Dict[str, Any]], analysis: Dict[str, Any], chart_type: str) -> Dict[str, Any]:
        """Generate Vega-Lite spec based on data analysis."""
        if not data or not analysis["fields"]:
            return {"error": "No data to visualize"}
        
        fields = analysis["fields"]
        base_spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "data": {"values": data},
            "width": 500,
            "height": 300
        }
        
        # Determine fields for x and y axes
        x_field = None
        y_field = None
        color_field = None
        
        if analysis["date_fields"]:
            x_field = analysis["date_fields"][0]
        elif analysis["category_fields"]:
            x_field = analysis["category_fields"][0]
        elif fields:
            x_field = fields[0]
        
        if analysis["numeric_fields"]:
            y_field = analysis["numeric_fields"][0]
        elif len(fields) > 1:
            y_field = fields[1]
        
        # Multi-series: if we have time/category and another category
        if analysis["date_fields"] and analysis["category_fields"]:
            x_field = analysis["date_fields"][0]
            color_field = analysis["category_fields"][0]
        
        # Generate spec based on chart type
        if chart_type == "line":
            x_type = "temporal" if analysis["date_fields"] else "ordinal"
            encoding = {
                "x": {"field": x_field, "type": x_type, "title": x_field.replace("_", " ").title()},
                "y": {"field": y_field, "type": "quantitative", "title": y_field.replace("_", " ").title()}
            }
            if color_field:
                encoding["color"] = {"field": color_field, "type": "nominal", "title": color_field.replace("_", " ").title()}
            
            return {
                **base_spec,
                "mark": {"type": "line", "point": True, "tooltip": True},
                "encoding": encoding
            }
        
        elif chart_type == "bar":
            return {
                **base_spec,
                "mark": {"type": "bar", "tooltip": True},
                "encoding": {
                    "x": {"field": x_field, "type": "nominal", "axis": {"labelAngle": -45}},
                    "y": {"field": y_field, "type": "quantitative"}
                }
            }
        
        elif chart_type == "scatter":
            x_num = analysis["numeric_fields"][0] if len(analysis["numeric_fields"]) > 0 else fields[0]
            y_num = analysis["numeric_fields"][1] if len(analysis["numeric_fields"]) > 1 else fields[1] if len(fields) > 1 else fields[0]
            
            return {
                **base_spec,
                "mark": {"type": "point", "tooltip": True},
                "encoding": {
                    "x": {"field": x_num, "type": "quantitative"},
                    "y": {"field": y_num, "type": "quantitative"}
                }
            }
        
        elif chart_type == "pie":
            cat_field = analysis["category_fields"][0] if analysis["category_fields"] else fields[0]
            val_field = analysis["numeric_fields"][0] if analysis["numeric_fields"] else fields[1] if len(fields) > 1 else fields[0]
            
            return {
                **base_spec,
                "mark": {"type": "arc", "tooltip": True},
                "encoding": {
                    "theta": {"field": val_field, "type": "quantitative"},
                    "color": {"field": cat_field, "type": "nominal"}
                }
            }
        
        # Default: bar chart
        return {
            **base_spec,
            "mark": {"type": "bar", "tooltip": True},
            "encoding": {
                "x": {"field": x_field, "type": "nominal"},
                "y": {"field": y_field, "type": "quantitative"}
            }
        }
    
    # ====== MAIN PROCESSING LOGIC ======
    
    # Validate input
    if not data_sample or not data_sample.strip():
        return json.dumps({
            "error": "data_sample cannot be empty",
            "status": "failed"
        })
    
    # Parse input data
    data = parse_input_data(data_sample)
    
    if not data:
        return json.dumps({
            "error": "Could not parse data_sample",
            "status": "failed",
            "hint": "Expected JSON array of objects or SQL result format"
        })
    
    # Analyze data structure
    analysis = analyze_data_structure(data)
    
    # Determine processing mode
    instruction_lower = processing_instruction.lower()
    
    # Handle specific chart type requests
    if instruction_lower.startswith("chart:"):
        chart_type = instruction_lower.split(":", 1)[1]
        spec = generate_vega_lite_spec(data, analysis, chart_type)
        return json.dumps({
            "status": "success",
            "type": "visualization",
            "format": "vega-lite",
            "chart_type": chart_type,
            "data_analysis": analysis,
            "output": spec
        })
    
    # Summarize mode
    elif instruction_lower == "summarize":
        stats = generate_summary_stats(data, analysis)
        return json.dumps({
            "status": "success",
            "type": "summary",
            "data_preview": data[:5],  # First 5 rows
            "analysis": analysis,
            "statistics": stats
        })
    
    # Format mode - return nicely formatted data
    elif instruction_lower == "format":
        return json.dumps({
            "status": "success",
            "type": "formatted_data",
            "data": data,
            "analysis": analysis,
            "row_count": len(data),
            "columns": analysis["fields"]
        })
    
    # Auto mode or visualize mode - intelligently decide
    else:
        # If visualization is recommended, generate it
        if analysis["recommended_viz"] and (instruction_lower == "auto" or instruction_lower == "visualize"):
            spec = generate_vega_lite_spec(data, analysis, analysis["recommended_viz"])
            stats = generate_summary_stats(data, analysis)
            
            return json.dumps({
                "status": "success",
                "type": "auto_visualization",
                "format": "vega-lite",
                "chart_type": analysis["recommended_viz"],
                "data_analysis": analysis,
                "statistics": stats,
                "output": spec
            })
        
        # Otherwise, return formatted summary
        else:
            stats = generate_summary_stats(data, analysis)
            return json.dumps({
                "status": "success",
                "type": "summary",
                "data_preview": data[:10],  # First 10 rows
                "analysis": analysis,
                "statistics": stats,
                "hint": "No clear visualization pattern detected. Use processing_instruction='chart:bar' or 'chart:line' to force a specific chart type."
            })


# Test the function
if __name__ == "__main__":
    import json
    
    # Test 1: Time series data (should auto-detect line chart)
    print("=" * 60)
    print("Test 1: Time Series Data (Auto Mode)")
    print("=" * 60)
    test_data_1 = [
        {"Region": "Americas", "Year": 2020, "Sales": 31774.3},
        {"Region": "Americas", "Year": 2021, "Sales": 37352.5},
        {"Region": "Americas", "Year": 2022, "Sales": 41452.5},
        {"Region": "Europe", "Year": 2020, "Sales": 1224.7},
        {"Region": "Europe", "Year": 2021, "Sales": 1702.8},
        {"Region": "Europe", "Year": 2022, "Sales": 2205.5}
    ]
    
    result_1 = process_structured_data(json.dumps(test_data_1), "auto")
    print(json.dumps(json.loads(result_1), indent=2)[:1000] + "...")
    print()
    
    # Test 2: Categorical data (should auto-detect bar chart)
    print("=" * 60)
    print("Test 2: Categorical Data (Auto Mode)")
    print("=" * 60)
    test_data_2 = [
        {"Product": "Vodka", "Sales_USD": 40900000},
        {"Product": "Vodka Liqueurs", "Sales_USD": 611000},
        {"Product": "Tequila", "Sales_USD": 25000000}
    ]
    
    result_2 = process_structured_data(json.dumps(test_data_2), "auto")
    print(json.dumps(json.loads(result_2), indent=2)[:1000] + "...")
    print()
    
    # Test 3: Summary mode
    print("=" * 60)
    print("Test 3: Summary Statistics Mode")
    print("=" * 60)
    result_3 = process_structured_data(json.dumps(test_data_1), "summarize")
    print(json.dumps(json.loads(result_3), indent=2))
    print()
    
    # Test 4: SQL result format
    print("=" * 60)
    print("Test 4: SQL Result Format")
    print("=" * 60)
    sql_format = {
        "columns": ["Category", "Value", "Percentage"],
        "rows": [
            ["A", 100, 25.5],
            ["B", 150, 38.2],
            ["C", 142, 36.3]
        ]
    }
    result_4 = process_structured_data(json.dumps(sql_format), "chart:pie")
    print(json.dumps(json.loads(result_4), indent=2)[:1000] + "...")
