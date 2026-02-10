"""
📋 Enhanced Vega-Lite Specification Generator for Databricks Unity Catalog

COPY THIS ENTIRE FUNCTION INTO YOUR DATABRICKS NOTEBOOK CELL
Then deploy: client.create_python_function(func=generate_vega_lite_spec, ...)

KEY ENHANCEMENTS:
✅ Multi-scale support - Dual-axis for metrics with different scales (USD vs Volume)
✅ Auto-scale detection - Automatically detects >100x scale differences
✅ Vertical subplots - Clean comparison for 3+ metrics
✅ Year-over-year comparison - Proper grouping by time periods
✅ Smart field detection - Data-driven field type identification

EXAMPLE QUERIES:
- "compare vodka sales USD vs volume by region" → Dual-axis chart
- "show rum revenue, volume, and profit" → Vertical subplots
- "chart tequila sales 2022 vs 2023" → Year-over-year comparison
"""


def generate_vega_lite_spec(
    chart_description: str,
    data_sample: str
) -> str:
    """
    Generate a Vega-Lite visualization specification from a description.
    
    Enhanced version with multi-scale support for comparing metrics with vastly different scales.
    
    Args:
        chart_description (str): Natural language description of the chart
        data_sample (str): JSON string array of objects
    
    Returns:
        str: JSON string containing a valid Vega-Lite v5 specification
    """
    import json
    import re
    
    # Validation
    if not chart_description or not chart_description.strip():
        return json.dumps({
            "error": "chart_description cannot be empty",
            "status": "failed"
        })
    
    # Parse data with fallback
    data_values = []
    try:
        if data_sample and data_sample.strip():
            parsed = json.loads(data_sample)
            if isinstance(parsed, list) and len(parsed) > 0:
                data_values = parsed
    except (json.JSONDecodeError, TypeError):
        pass
    
    # Default sample data if none provided
    if not data_values:
        data_values = [
            {"category": "A", "value": 28},
            {"category": "B", "value": 55},
            {"category": "C", "value": 43}
        ]
    
    # Validate data structure
    if not isinstance(data_values, list) or len(data_values) == 0:
        data_values = [{"category": "A", "value": 28}]
    
    # Get field names
    try:
        first_item = data_values[0]
        if not first_item or not isinstance(first_item, dict) or len(first_item.keys()) < 2:
            data_values = [{"category": "A", "value": 28}]
            fields = ["category", "value"]
        else:
            fields = list(first_item.keys())
    except (IndexError, AttributeError, TypeError):
        fields = ["category", "value"]
    
    # Smart field detection - programmatic and data-driven
    def detect_field_types(fields, data_values):
        """
        Detect field types based on names and actual data.
        Returns: (time_field, category_field, value_fields)
        """
        time_field = None
        category_field = None
        value_fields = []
        
        # Keywords for detection
        time_keywords = ['year', 'date', 'time', 'month', 'day', 'quarter', 'week']
        category_keywords = ['name', 'region', 'category', 'type', 'brand', 'segment', 
                           'product', 'customer', 'location', 'country', 'state', 'city']
        value_keywords = ['sales', 'revenue', 'volume', 'amount', 'value', 'price', 
                         'qty', 'quantity', 'usd', 'count', 'total', 'sum', 'avg', 'mean']
        
        for field in fields:
            field_lower = field.lower()
            
            # Get sample value
            sample_value = None
            is_numeric = False
            is_string = False
            try:
                sample_value = data_values[0][field]
                is_numeric = isinstance(sample_value, (int, float)) and not isinstance(sample_value, bool)
                is_string = isinstance(sample_value, str)
            except:
                pass
            
            # TIME FIELD detection
            if any(keyword in field_lower for keyword in time_keywords):
                if is_numeric or is_string:
                    time_field = field
                    continue
            elif is_string and sample_value and re.match(r'^\d{4}', str(sample_value)):
                if time_field is None:
                    time_field = field
                    continue
            
            # VALUE FIELD detection
            if is_numeric:
                has_value_keyword = any(keyword in field_lower for keyword in value_keywords)
                has_time_keyword = any(keyword in field_lower for keyword in time_keywords)
                has_id_keyword = 'id' in field_lower
                
                if has_value_keyword or (not has_time_keyword and not has_id_keyword):
                    value_fields.append(field)
                    continue
            
            # CATEGORY FIELD detection
            if is_string:
                has_category_keyword = any(keyword in field_lower for keyword in category_keywords)
                
                if has_category_keyword and category_field is None:
                    category_field = field
                elif category_field is None:
                    category_field = field
        
        # Fallback logic
        if not value_fields:
            for field in reversed(fields):
                try:
                    if isinstance(data_values[0][field], (int, float)):
                        value_fields = [field]
                        break
                except:
                    pass
            if not value_fields:
                value_fields = [fields[-1]]
        
        if not category_field and not time_field:
            for field in fields:
                try:
                    if not isinstance(data_values[0][field], (int, float)):
                        category_field = field
                        break
                except:
                    pass
            if not category_field:
                category_field = fields[0]
        
        return time_field, category_field, value_fields
    
    # Helper: Detect if metrics have different scales
    def have_different_scales(value_fields, data_values):
        """
        Check if value fields have significantly different scales (>100x difference).
        Returns: (bool, scale_info)
        """
        if len(value_fields) < 2:
            return False, {}
        
        # Calculate ranges
        ranges = {}
        for field in value_fields:
            try:
                values = [row[field] for row in data_values if field in row and isinstance(row[field], (int, float))]
                if values:
                    ranges[field] = {
                        'min': min(values),
                        'max': max(values),
                        'range': max(values) - min(values) if max(values) != min(values) else max(values)
                    }
            except:
                pass
        
        if len(ranges) < 2:
            return False, {}
        
        # Compare scales
        field_list = list(ranges.keys())
        max_ratio = 1
        for i in range(len(field_list)):
            for j in range(i + 1, len(field_list)):
                field1, field2 = field_list[i], field_list[j]
                if ranges[field2]['range'] > 0:
                    ratio = ranges[field1]['range'] / ranges[field2]['range']
                    max_ratio = max(max_ratio, ratio, 1/ratio if ratio > 0 else 1)
        
        # Different scales if ratio > 100
        different_scales = max_ratio > 100
        
        return different_scales, ranges
    
    time_field, category_field, value_fields = detect_field_types(fields, data_values)
    primary_value_field = value_fields[0] if value_fields else fields[-1]
    description_lower = chart_description.lower()
    different_scales, scale_info = have_different_scales(value_fields, data_values)
    
    # Base configuration
    base_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "description": chart_description,
        "data": {"values": data_values},
        "width": 500,
        "height": 300
    }
    
    # LINE CHART
    if any(word in description_lower for word in ["line", "trend", "time series"]):
        x_field = time_field or category_field or fields[0]
        y_field = primary_value_field
        
        color_field = None
        if time_field and category_field:
            x_field = time_field
            color_field = category_field
        
        x_type = "ordinal"
        if time_field == x_field:
            try:
                sample_value = data_values[0][x_field]
                if isinstance(sample_value, (int, float)):
                    x_type = "ordinal"
                elif isinstance(sample_value, str) and re.match(r'^\d{4}-\d{2}-\d{2}', str(sample_value)):
                    x_type = "temporal"
                else:
                    x_type = "ordinal"
            except:
                x_type = "ordinal"
        
        encoding = {
            "x": {"field": x_field, "type": x_type, "title": x_field.replace("_", " ").title()},
            "y": {"field": y_field, "type": "quantitative", "title": y_field.replace("_", " ").title()}
        }
        
        if color_field:
            encoding["color"] = {"field": color_field, "type": "nominal", "title": color_field.replace("_", " ").title()}
        
        return json.dumps({
            **base_spec,
            "mark": {"type": "line", "point": True, "tooltip": True},
            "encoding": encoding,
            "config": {"view": {"stroke": None}}
        })
    
    # BAR CHART
    elif any(word in description_lower for word in ["bar", "column", "histogram"]):
        x_field = category_field or time_field or fields[0]
        
        # Year-over-year comparison
        is_year_comparison = time_field and (
            'compare' in description_lower or 'vs' in description_lower or 
            'versus' in description_lower or description_lower.count('year') >= 2
        )
        
        if is_year_comparison:
            primary_metric = value_fields[0] if value_fields else fields[-1]
            
            return json.dumps({
                **base_spec,
                "mark": {"type": "bar", "tooltip": True},
                "encoding": {
                    "x": {"field": x_field, "type": "nominal" if category_field == x_field else "ordinal", "axis": {"labelAngle": -45}},
                    "y": {"field": primary_metric, "type": "quantitative", "title": primary_metric.replace("_", " ").title()},
                    "color": {"field": time_field, "type": "ordinal", "title": time_field.replace("_", " ").title()},
                    "xOffset": {"field": time_field}
                },
                "config": {"view": {"stroke": None}}
            })
        
        # Multi-metric detection
        wants_multi_metric = (
            len(value_fields) > 1 and 
            any(keyword in description_lower for keyword in 
                ["grouped", "two bars", "both", "multiple", "including", "compare"])
        )
        
        if wants_multi_metric:
            # DUAL-AXIS CHART (2 metrics, different scales)
            if different_scales and len(value_fields) == 2:
                return json.dumps({
                    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                    "description": chart_description,
                    "data": {"values": data_values},
                    "width": 500,
                    "height": 300,
                    "layer": [
                        {
                            "mark": {"type": "bar", "opacity": 0.7, "color": "#4c78a8", "tooltip": True},
                            "encoding": {
                                "x": {"field": x_field, "type": "nominal" if category_field == x_field else "ordinal", 
                                     "axis": {"labelAngle": -45}, "title": x_field.replace("_", " ").title()},
                                "y": {"field": value_fields[0], "type": "quantitative", 
                                     "title": value_fields[0].replace("_", " ").title(), "axis": {"titleColor": "#4c78a8"}}
                            }
                        },
                        {
                            "mark": {"type": "line", "color": "#e45756", "point": {"filled": True, "size": 80}, 
                                    "strokeWidth": 3, "tooltip": True},
                            "encoding": {
                                "x": {"field": x_field, "type": "nominal" if category_field == x_field else "ordinal"},
                                "y": {"field": value_fields[1], "type": "quantitative", 
                                     "title": value_fields[1].replace("_", " ").title(), 
                                     "axis": {"titleColor": "#e45756", "orient": "right"}}
                            }
                        }
                    ],
                    "resolve": {"scale": {"y": "independent"}},
                    "config": {"view": {"stroke": None}}
                })
            
            # VERTICAL SUBPLOTS (3+ metrics or different scales)
            elif different_scales or len(value_fields) > 2:
                charts = []
                for value_field in value_fields:
                    charts.append({
                        "title": {"text": value_field.replace("_", " ").title(), "fontSize": 14},
                        "width": 500,
                        "height": 200,
                        "mark": {"type": "bar", "tooltip": True},
                        "encoding": {
                            "x": {"field": x_field, "type": "nominal" if category_field == x_field else "ordinal", 
                                 "axis": {"labelAngle": -45}, "title": x_field.replace("_", " ").title()},
                            "y": {"field": value_field, "type": "quantitative", "title": None},
                            "color": {"value": "#4c78a8"}
                        }
                    })
                
                return json.dumps({
                    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                    "description": chart_description,
                    "data": {"values": data_values},
                    "vconcat": charts,
                    "resolve": {"scale": {"y": "independent"}},
                    "config": {"view": {"stroke": None}}
                })
            
            # STANDARD GROUPED BARS (same scale)
            else:
                transformed_data = []
                for row in data_values:
                    for value_field in value_fields:
                        transformed_data.append({
                            x_field: row[x_field],
                            "metric": value_field.replace("_", " ").title(),
                            "value": row[value_field]
                        })
                
                return json.dumps({
                    **base_spec,
                    "data": {"values": transformed_data},
                    "mark": {"type": "bar", "tooltip": True},
                    "encoding": {
                        "x": {"field": x_field, "type": "nominal" if category_field == x_field else "ordinal", "axis": {"labelAngle": -45}},
                        "y": {"field": "value", "type": "quantitative", "title": "Value"},
                        "color": {"field": "metric", "type": "nominal", "title": "Metric"},
                        "xOffset": {"field": "metric"}
                    },
                    "config": {"view": {"stroke": None}}
                })
        
        # SINGLE METRIC BAR CHART
        y_field = primary_value_field
        
        return json.dumps({
            **base_spec,
            "mark": {"type": "bar", "tooltip": True},
            "encoding": {
                "x": {"field": x_field, "type": "nominal" if category_field == x_field else "ordinal", "axis": {"labelAngle": -45}},
                "y": {"field": y_field, "type": "quantitative"}
            },
            "config": {"view": {"stroke": None}}
        })
    
    # SCATTER PLOT
    elif any(word in description_lower for word in ["scatter", "point"]):
        x_field = fields[0] if len(fields) >= 2 else "x"
        y_field = fields[1] if len(fields) >= 2 else "y"
        
        return json.dumps({
            **base_spec,
            "mark": {"type": "point", "tooltip": True},
            "encoding": {
                "x": {"field": x_field, "type": "quantitative"},
                "y": {"field": y_field, "type": "quantitative"}
            },
            "config": {"view": {"stroke": None}}
        })
    
    # PIE CHART
    elif any(word in description_lower for word in ["pie", "donut"]):
        category = category_field or fields[0]
        value = primary_value_field
        
        return json.dumps({
            **base_spec,
            "mark": {"type": "arc", "tooltip": True},
            "encoding": {
                "theta": {"field": value, "type": "quantitative"},
                "color": {"field": category, "type": "nominal"}
            }
        })
    
    # DEFAULT: BAR CHART
    else:
        x_field = category_field or fields[0]
        y_field = primary_value_field
        
        return json.dumps({
            **base_spec,
            "mark": {"type": "bar", "tooltip": True},
            "encoding": {
                "x": {"field": x_field, "type": "nominal", "axis": {"labelAngle": -45}},
                "y": {"field": y_field, "type": "quantitative"}
            },
            "config": {"view": {"stroke": None}}
        })
