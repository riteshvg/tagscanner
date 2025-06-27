document.addEventListener("DOMContentLoaded", function() {
    // Get the elements
    const miscElement = document.getElementById("misc");
    const container = document.getElementById("components-overview");

    // Function to hide the container
    function hideContainer() {
        if (container) {
            container.style.display = "none";
        }
    }

    // Function to show the container
    function showContainer() {
        if (container) {
            container.style.display = "block";
        }
    }

    // Add a click event listener to the 'misc' element
    if (miscElement) {
        miscElement.addEventListener("click", function(event) {
            hideContainer();
            event.stopPropagation(); // Prevent the event from bubbling up to the document
        });
    }

    // Add a click event listener to the document
    document.addEventListener("click", function(event) {
        // Check if the click was outside the 'misc' element
        if (miscElement && !miscElement.contains(event.target)) {
            showContainer();
        }
    });

    // Ensure the container is shown when the page is loaded
    showContainer();
});
