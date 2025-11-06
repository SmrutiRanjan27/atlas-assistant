# excel_query_tool.py
from langchain_core.tools import BaseTool, ToolException
from typing import Type, List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field, model_validator
import pandas as pd
import re




class Filter(BaseModel):
    column: str = Field(..., description="Column to filter on")
    op: str = Field(..., description="Comparison operator such as ==, >, <, or in")
    value: Union[str, int, float, List[Any]] = Field(..., description="Value(s) to compare against")




class QueryJSON(BaseModel):
    filters: Optional[List[Filter]] = Field(None, description="List of filter conditions")
    groupby: Optional[List[str]] = Field(None, description="Columns to group by when aggregating data")
    aggregate: Optional[Dict[str, str]] = Field(
        None, description="Aggregation map (e.g. {'sales': 'sum'}). Must be provided with 'groupby'."
    )
    select: Optional[List[str]] = Field(None, description="Columns to select in the final result")


    @model_validator(mode="after")
    def validate_groupby_aggregate_pair(self):
        if (self.groupby and not self.aggregate) or (self.aggregate and not self.groupby):
            raise ValueError("Both 'groupby' and 'aggregate' must be provided together.")
        return self




class ExcelQueryArgs(BaseModel):
    file_path: str = Field(..., description="Path to the Excel/CSV file")
    query_json: QueryJSON = Field(..., description="Structured query in JSON format")




class ExcelQueryTool(BaseTool):
    """Query Excel files safely with structured output."""
    name: str = "excel_query_tool"
    description: str = (
        "Executes structured data queries on Excel or CSV files using filters, groupings, "
        "aggregations, and column selection. Returns both structured and summarized output."
    )
    handle_tool_error: bool = True
    args_schema: Type[BaseModel] = ExcelQueryArgs


    def _run(self, file_path: str, query_json: dict) -> dict:
        try:
            df = pd.read_excel(file_path, engine="openpyxl")


            # Normalize column names
            original_cols = df.columns.tolist()
            lower_to_original = {c.lower(): c for c in original_cols}
            df.columns = [c.lower() for c in original_cols]


            if not isinstance(query_json, dict):
                query_json = query_json.dict(exclude_none=True)


            def resolve_col(col: str) -> str:
                key = col.lower()
                if key not in lower_to_original:
                    raise KeyError(f"Column '{col}' not found. Available: {list(lower_to_original.values())}")
                return key


            # --- Filters ---
            for f in query_json.get("filters", []):
                col, op, val = resolve_col(f["column"]), f["op"], f["value"]


                if op == "==":
                    if isinstance(val, str) and df[col].dtype == "object":
                        exact_match = df[df[col].str.lower() == val.lower()]
                        df = exact_match if not exact_match.empty else df[df[col].str.contains(re.escape(val), case=False, na=False)]
                    else:
                        df = df[df[col] == val]
                elif op == "!=":
                    df = df[df[col].astype(str).str.lower() != str(val).lower()]
                elif op == ">":
                    df = df[df[col] > val]
                elif op == "<":
                    df = df[df[col] < val]
                elif op == "in":
                    if not isinstance(val, list):
                        raise ValueError("'in' operator requires a list.")
                    df = df[df[col].astype(str).str.lower().isin([str(v).lower() for v in val])]


            # --- Groupby / Aggregate ---
            groupby_cols = query_json.get("groupby")
            agg_spec = query_json.get("aggregate")
            if groupby_cols and agg_spec:
                groupby_cols = [resolve_col(c) for c in groupby_cols]
                agg_spec = {resolve_col(k): v for k, v in agg_spec.items()}
                df = df.groupby(groupby_cols).agg(agg_spec).reset_index()


            # --- Select ---
            if "select" in query_json and query_json["select"]:
                select_cols = [resolve_col(c) for c in query_json["select"]]
                df = df[select_cols]


            # Restore original column case
            df.columns = [lower_to_original[c] for c in df.columns]


            # --- Format + summary ---
            formatted_rows = self._format_rows(df)
            summary = self._summarize(df)


            return {
                "columns": list(df.columns),
                "rows": formatted_rows,
                "summary": summary,
                "row_count": len(df),
            }


        except Exception as e:
            raise ToolException(f"Failed to query Excel. Error: {type(e).__name__}: {e}")


    def _format_rows(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        def fmt(v):
            if isinstance(v, float):
                return f"{v:,.2f}"
            return str(v)
        return [{k: fmt(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


    def _summarize(self, df: pd.DataFrame) -> str:
        if df.empty:
            return "No records found."
        if len(df) == 1:
            return "Found 1 matching record."
        if len(df.columns) == 1:
            col = df.columns[0]
            values = ", ".join(map(str, df[col].tolist()[:5]))
            return f"{len(df)} records found in '{col}': {values}"
        return f"{len(df)} records found across {len(df.columns)} columns."