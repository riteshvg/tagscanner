<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $to = "tagscannerfeedback@gmail.com"; // Replace with your email
    $subject = "New Contact Form Submission";
    $name = htmlspecialchars($_POST["name"]);
    $email = htmlspecialchars($_POST["email"]);
    $message = htmlspecialchars($_POST["message"]);

    $headers = "From: $email\r\n";
    $headers .= "Reply-To: $email\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    $body = "Name: $name\n";
    $body .= "Email: $email\n\n";
    $body .= "Message:\n$message\n";

    if (mail($to, $subject, $body, $headers)) {
        echo "Success! Your message has been sent.";
    } else {
        echo "Error! Your message could not be sent.";
    }
} else {
    echo "Invalid Request.";
}
?>
