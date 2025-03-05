from datetime import datetime

def calculate_days_between_dates(date1_str: str, date2_str: str, date_format: str = "%Y-%m-%d") -> int:
    """
    Calculate the number of days between two dates.
    
    Args:
        date1_str (str): First date string
        date2_str (str): Second date string
        date_format (str): Format of the input dates (default: YYYY-MM-DD)
        
    Returns:
        int: Number of days between the two dates (absolute value)
    """
    try:
        # Convert string dates to datetime objects
        date1 = datetime.strptime(date1_str, date_format)
        date2 = datetime.strptime(date2_str, date_format)
        
        # Calculate the difference in days
        delta = date2 - date1
        
        # Return absolute number of days
        return abs(delta.days)
    except ValueError as e:
        print(f"Error: {e}")
        print(f"Please ensure dates are in the correct format: {date_format}")
        return None

def print_days_between_dates(date1_str: str, date2_str: str, date_format: str = "%Y-%m-%d") -> None:
    """
    Print the number of days between two dates.
    
    Args:
        date1_str (str): First date string
        date2_str (str): Second date string
        date_format (str): Format of the input dates (default: YYYY-MM-DD)
    """
    days = calculate_days_between_dates(date1_str, date2_str, date_format)
    if days is not None:
        print(f"Number of days between {date1_str} and {date2_str}: {days} days")

def main():
    # Example usage
    date1 = "2024-03-15"
    date2 = "2024-04-15"
    
    print_days_between_dates(date1, date2)
    
    # Example with different date format
    date3 = "15/03/2024"
    date4 = "15/04/2024"
    print_days_between_dates(date3, date4, date_format="%d/%m/%Y")

if __name__ == "__main__":
    main() 