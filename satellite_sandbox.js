const urlParams = new URLSearchParams(window.location.search);
console.log(urlParams)
        const script_URL = urlParams.get("scriptURL");

        if (script_URL) {
            fetch(script_URL)
                .then(response => response.text())
                .then(jsCode => {
                    // 🔹 Modify the script content here
                    jsCode = jsCode.replace("console.log", "alert"); // Example modification

                    // 🔹 Execute the modified script
                    const script = document.createElement("script");
                    script.textContent = jsCode;
                    document.body.appendChild(script);
                })
                .catch(error => console.error("Script fetch failed:", error));
        } else {
            console.warn("No scriptURL provided.");
        }
