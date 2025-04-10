// API configuration
const API_KEY = 'AIzaSyAbpEnAdTaZzk9l-jq9ZZlP7CFnPKFiymE'; // <-- IMPORTANT: REPLACE WITH YOUR ACTUAL API KEY
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'; // Use a model that supports context well

// HTML Elements
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const locationButton = document.getElementById('location-button');

// State
let userLocation = null;
let conversationHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
const MAX_HISTORY_TURNS = 8;

// --- Prompts ---

// System Instruction (Prepended to history for consistent behavior) - ENHANCED DETAILS
const SYSTEM_INSTRUCTION = `
You are FindMyStay, an efficient, knowledgeable, and highly specialized AI assistant. Your *sole* purpose is to provide specific, detailed information and assistance related to hotels directly and concisely.

**Your Capabilities & Tasks:**
- Finding and listing specific examples of nearby hotels based on coordinates, providing **detailed information in a bulleted format** as specified in the relevant template.
- Describing hotel types, amenities, star ratings, and terminology.
- Discussing hotel chains, loyalty programs, and general booking tips.
- **CRUCIALLY: When the user asks about hotels (e.g., in a specific location, of a certain type, or belonging to a chain), your primary goal is to provide specific, named examples with detailed information based on your general knowledge.** For each hotel listed, include details like:
    *   **Area/Locality:** Specific area or nearby landmark.
    *   **General Type:** (e.g., Business, Luxury, Budget, Boutique, Heritage).
    *   **Price Indication:** General range (e.g., Budget, Mid-Range, Upper Mid-Range, Luxury) or estimated INR range (clearly state NOT real-time).
    *   **Key Amenities/Features:** List 3-5 notable ones (e.g., Restaurant, Free Wi-Fi, Parking, Pool, Gym, Spa, AC Rooms, Room Service).
    *   **Target Audience/Vibe:** Briefly mention if known (e.g., Good for families, Business travelers, Couples, Solo).
    *   **Notable Aspect/USP:** A unique feature or what it's commonly known for (e.g., Rooftop bar, Historical significance, Specific restaurant, Great views).
    *   **General Note:** A concise overall description.
    **Provide this information clearly, preferably using bullet points for each hotel.** Prioritize listing these detailed examples over just defining the category. If you lack specific detailed examples, state that clearly.
- Comparing hotels based on features, general price range indicators, or location descriptions (state you CANNOT provide real-time prices or availability).
- Answering clarifying questions about information you've previously provided, using the context.

**VERY IMPORTANT RULES:**
1.  **Hotel Focus:** ONLY answer questions directly related to hotels.
2.  **Refusal:** If the user asks about ANYTHING else, respond firmly with: "My apologies, but my expertise is strictly focused on hotels. How can I assist you with your hotel needs?" Do NOT answer the off-topic question.
3.  **Context:** Use conversation history for follow-up questions.
4.  **No Real-time Data / Contact Info:** Always state you cannot provide live pricing/availability. Also state you cannot provide direct phone numbers or email addresses for privacy and accuracy reasons. Recommend checking official hotel websites or travel sites.
5.  **DIRECT ACTION / NO UNNECESSARY QUESTIONS:** Provide requested lists/information directly. DO NOT ask for preferences unless offered or requested for filtering.
6.  **Prioritize Detailed Examples:** Listing actual hotels with the requested bulleted details is the priority when applicable.
7.  **Persona:** Expert, helpful, efficient, and factual. Focus on delivering information clearly.
`;


// Specific Prompt for finding NEARBY hotels (used when location is known and user asks for nearby) - ENHANCED DETAILS
const HOTEL_PROMPT_TEMPLATE_NEARBY = `
My current location is latitude {latitude}, longitude {longitude}. Location is likely in India.
Act as FindMyStay. Based *only* on these coordinates and your general knowledge:
**Directly provide a list** of known hotels near this location. Do not ask for my budget or preferences first.

For each hotel (list at least 3 if possible), provide the following details in bullet points:
*   **Hotel Name:** [Full Name]
*   **Area/Locality:** [Specific area or nearby landmark]
*   **General Type:** [e.g., Business Hotel, 3-Star, Heritage Property, Budget Lodge]
*   **Price Indication:** [Budget, Mid-Range, Luxury, or estimated INR range like ₹3000-₹5000 per night. State clearly this is NOT real-time.]
*   **Key Amenities/Features:** [List 3-5 known features like Restaurant, Free Wi-Fi, Parking Available, Swimming Pool, AC Rooms, Room Service, Gym]
*   **Target Audience/Vibe:** [Optional, if known: e.g., Good for Business Travelers, Family-friendly, Popular with Tourists]
*   **Notable Aspect/USP:** [Optional, if known: e.g., Rooftop Restaurant, Known for Cleanliness, Close to Metro Station, Specific View]
*   **General Note:** [A brief overall description based on general knowledge]

After the list, state clearly that you cannot give real-time prices/availability or direct contact information, and recommend checking travel websites (MakeMyTrip, Goibibo, Booking.com) or the official hotel website for accurate details and booking.
`;


// Fallback for API Errors
const FALLBACK_ERROR_MESSAGE = "I'm having trouble connecting or processing your request right now. Please try again in a moment.";

// --- Functions ---

function addMessage(content, role = 'model') { // Role: 'user' or 'model'
    const isUser = role === 'user';
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    let formattedContent = content;
    if (!isUser) {
        // Basic Markdown-like formatting for bot responses
        formattedContent = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>')       // Italics
            .replace(/^(\s*)[-*]\s+/gm, '$1• ')         // Bullets (-)
            .replace(/^(\s*)\*\s+/gm, '$1• ')           // Bullets (*)
            .replace(/\n/g, '<br>');                    // Newlines
        // Handle numbered lists (simple approach, might need refinement for nested)
        formattedContent = formattedContent.replace(/^(\s*)(\d+)\.\s+/gm, (match, whitespace, number) => `${whitespace}${number}. `);


    }

    messageContent.innerHTML = formattedContent; // Use innerHTML for rendering HTML tags


    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add to conversation history
    // Avoid adding the initial greeting or errors to the actual API history
    if (role === 'user' || (role === 'model' && content !== FALLBACK_ERROR_MESSAGE && !content.includes("Welcome to FindMyStay") && !content.includes("Configuration Alert"))) {
         conversationHistory.push({ role: role, parts: [{ text: content }] });

        // Limit history size
        if (conversationHistory.length > MAX_HISTORY_TURNS) {
            conversationHistory.shift(); // Remove the very first element
        }
    }

    // Save conversation history
    saveConversationHistory();
}


async function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
             addMessage("Geolocation is not supported by your browser.", 'model');
            resolve(null);
            return;
        }

        addMessage("Okay, let me try to get your current location...", 'model');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                addMessage(`Got it! Your location is approximately Lat: ${userLocation.latitude.toFixed(4)}, Lon: ${userLocation.longitude.toFixed(4)}. Now you can ask me to 'find nearby hotels' or ask other hotel-related questions!`, 'model');
                resolve(userLocation);
            },
            (error) => {
                let errorMsg = "I couldn't access your location. ";
                switch (error.code) {
                    case error.PERMISSION_DENIED: errorMsg += "Please grant permission when prompted."; break;
                    case error.POSITION_UNAVAILABLE: errorMsg += "Location information is unavailable right now."; break;
                    case error.TIMEOUT: errorMsg += "The request timed out. Please try again."; break;
                    default: errorMsg += "An unknown error occurred."; break;
                }
                addMessage(errorMsg, 'model');
                resolve(null);
            },
            { timeout: 10000 }
        );
    });
}

async function callAPI(currentUserMessage, isNearbyHotelRequest = false) {
    // --- API Key Check ---
    if (!API_KEY) {
         console.error("API Key is missing or is the placeholder value.");
         return "Configuration Error: API Key not set correctly.";
    }

    // --- Determine Prompt Text for Current User Turn ---
    let promptTextForUserTurn;
    if (isNearbyHotelRequest && userLocation) {
        promptTextForUserTurn = HOTEL_PROMPT_TEMPLATE_NEARBY
            .replace('{latitude}', userLocation.latitude)
            .replace('{longitude}', userLocation.longitude);
    } else {
        promptTextForUserTurn = currentUserMessage;
    }

    // --- Construct Combined Prompt with History ---
    const historyString = conversationHistory
        .map(turn => `${turn.role === 'user' ? 'User' : 'FindMyStay'}: ${turn.parts[0].text}`)
        .join('\n');
    const combinedPrompt = `${SYSTEM_INSTRUCTION}\n\n<Conversation History>\n${historyString}\n</Conversation History>\n\nUser: ${promptTextForUserTurn}\nFindMyStay:`;

    // --- API Call ---
    try {
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({
                contents: [{ parts: [{ text: combinedPrompt }] }],
                generationConfig: {
                    temperature: 0.4, // Lowered temperature for factual focus
                    maxOutputTokens: 2000, // Increased for potentially detailed lists
                },
                 safetySettings: [
                     { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                     { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                     { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                     { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
                 ]
            })
        });

        // --- Handle Non-OK Response ---
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`API Error ${response.status}: ${errorBody}`);
             try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson.error && errorJson.error.message) { return `API Error: ${errorJson.error.message}`; }
             } catch (e) { /* Ignore JSON parsing error */ }
            return FALLBACK_ERROR_MESSAGE;
        }

        // --- Process OK Response ---
        const data = await response.json();

        // 1. Check for Prompt Block
        if (data.promptFeedback && data.promptFeedback.blockReason) {
             console.warn(`Prompt blocked by API: ${data.promptFeedback.blockReason}`);
             return `Your request could not be processed due to content policy (${data.promptFeedback.blockReason}). Please focus on standard hotel-related inquiries.`;
         }

        // 2. Check for Candidates and Content
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];

            // 2a. Check Safety Ratings on Response
            if (candidate.safetyRatings) {
                const blockedRating = candidate.safetyRatings.find(rating => rating.blocked);
                if (blockedRating) {
                    console.warn(`Response blocked due to safety rating: ${blockedRating.category}`);
                    return "I cannot provide a response to that request due to safety guidelines. Please ask something else related to hotels.";
                }
            }

            // 2b. Check Finish Reason
            const finishReason = candidate.finishReason;
            if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
                console.warn(`API response finished with reason: ${finishReason}`);
                 if (finishReason === "SAFETY") { return "My safety settings prevented completing the response. Could you rephrase your request about hotels?"; }
                 if (finishReason === "RECITATION") { return "My response may contain information from protected sources and cannot be displayed. Please ask differently."; }
                 return "I couldn't generate a complete response due to an unexpected issue ("+finishReason+"). Please try asking differently.";
            }

            // 2c. Extract Content
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0 && candidate.content.parts[0].text) {
                 let responseText = candidate.content.parts[0].text.trim();
                 if (finishReason === "MAX_TOKENS") {
                     responseText += "\n\n*(Response may have been shortened)*";
                 }
                 return responseText;
            }
        }

        // 3. If no valid content found
        console.error("Invalid API response structure or no content:", JSON.stringify(data));
        return FALLBACK_ERROR_MESSAGE;

    } catch (error) {
        console.error("Error calling API:", error);
        return FALLBACK_ERROR_MESSAGE;
    }
}


async function handleUserInput() {
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    userInput.value = '';
    userInput.disabled = true;
    sendButton.disabled = true;
    locationButton.disabled = true;

    // --- Loading Indicator ---
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'message bot loading-indicator';
    loadingMessage.innerHTML = '<div class="message-content"><div class="dot-flashing"></div></div>';
    chatMessages.appendChild(loadingMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // --- Determine Intent ---
        const lowerCaseMessage = message.toLowerCase();
        const wantsNearbyHotels = ( lowerCaseMessage.includes('find') || lowerCaseMessage.includes('search') || lowerCaseMessage.includes('look for') || lowerCaseMessage.includes('show me') || lowerCaseMessage.includes('list') ) && ( lowerCaseMessage.includes('hotel') || lowerCaseMessage.includes('stay') || lowerCaseMessage.includes('accommodation') || lowerCaseMessage.includes('inn') || lowerCaseMessage.includes('motel') ) && ( lowerCaseMessage.includes('near') || lowerCaseMessage.includes('around') || lowerCaseMessage.includes('nearby') || lowerCaseMessage.includes('location') || lowerCaseMessage.includes('area') || lowerCaseMessage.includes('here') );

        let responseText;

        // --- Handle Intent ---
        if (wantsNearbyHotels) {
            if (userLocation) {
                responseText = await callAPI(message, true); // Use specific template
            } else {
                responseText = "To find hotels *near you*, I need your location first. Please click the location button <i class='material-icons' style='font-size: inherit; vertical-align: bottom;'>location_on</i> above the text box.";
                 // Handle early exit for missing location
                 if (chatMessages.contains(loadingMessage)) { chatMessages.removeChild(loadingMessage); }
                 addMessage(responseText, 'model');
                 userInput.disabled = false; sendButton.disabled = false; locationButton.disabled = false; userInput.focus();
                 return; // Don't proceed further
            }
        } else {
            responseText = await callAPI(message, false); // Use general processing
        }

        // --- Display Response ---
        if (chatMessages.contains(loadingMessage)) { chatMessages.removeChild(loadingMessage); }

        if (responseText) {
             addMessage(responseText, 'model');
        } else {
             addMessage(FALLBACK_ERROR_MESSAGE, 'model'); // Fallback if API call somehow returned nothing
        }

    } catch (error) {
        console.error("Error in handleUserInput:", error);
        if (chatMessages.contains(loadingMessage)) { chatMessages.removeChild(loadingMessage); }
        addMessage("Sorry, an unexpected error occurred while handling your request.", 'model');
    } finally {
        // --- Re-enable Inputs ---
        userInput.disabled = false; sendButton.disabled = false; locationButton.disabled = false; userInput.focus();
    }
}

// --- Event Listeners ---
sendButton.addEventListener('click', handleUserInput);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserInput(); } });
locationButton.addEventListener('click', async () => {
    locationButton.disabled = true; userInput.disabled = true; sendButton.disabled = true;
    await getUserLocation(); // Handles its own messages
    locationButton.disabled = false; userInput.disabled = false; sendButton.disabled = false; userInput.focus();
});

// --- Initialisation ---
function initializeChat() {
    chatMessages.innerHTML = '';
    conversationHistory = [];
    // Add initial greeting - NOT added to API history
    addMessage("Welcome to FindMyStay! 👋 I'm your dedicated AI assistant for all things hotels. Ask me about hotel types, amenities, booking tips, or finding options nearby (use the <i class='material-icons' style='font-size: inherit; vertical-align: bottom;'>location_on</i> button for nearby searches!). How can I help?", 'model');
    // API Key Check - Message NOT added to API history
    if (!API_KEY) {
        addMessage("<strong>Configuration Alert:</strong> Please replace the placeholder API Key in the script for the bot to work correctly.", 'model');
        console.error("FATAL: API Key is missing or is the placeholder value.");
    }
}
initializeChat(); // Start the chat

// Function to save conversation history
function saveConversationHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
}

// Function to load conversation history
function loadConversationHistory() {
    const savedHistory = JSON.parse(localStorage.getItem('chatHistory'));
    if (savedHistory) {
        conversationHistory = savedHistory;
        // Clear existing messages
        chatMessages.innerHTML = '';
        // Add all messages from history
        savedHistory.forEach(msg => {
            addMessage(msg.content, msg.role);
        });
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Function to clear conversation history
function clearConversationHistory() {
    conversationHistory = [];
    localStorage.removeItem('chatHistory');
    chatMessages.innerHTML = '';
    addMessage('Welcome to FindMyStay! How can I help you find your perfect hotel?', 'bot');
}

// Add clear history button to the header
const clearButton = document.createElement('button');
clearButton.id = 'clear-history';
clearButton.innerHTML = '<span class="material-icons">delete</span> Clear History';
clearButton.addEventListener('click', clearConversationHistory);
document.querySelector('.chat-header').appendChild(clearButton);

// Load conversation history when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadConversationHistory();
    if (conversationHistory.length === 0) {
        addMessage('Welcome to FindMyStay! How can I help you find your perfect hotel?', 'bot');
    }
});