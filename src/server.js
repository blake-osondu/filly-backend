const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const OpenAI = require('openai'); // Updated import
const z = require("zod");
const zodResponseFormat = require("openai/helpers/zod");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// Get API key status
app.get('/api/key-status', (req, res) => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  res.json({ 
    status: hasKey ? 'configured' : 'missing',
    message: hasKey ? 'API key is configured' : 'API key is not configured'
  });
});

// Process form data
app.post('/api/process-form', async (req, res) => {

  const Input = z.object({
      id: z.string(),
      value: z.string()
  });

  const ProcessedData = z.object({
      mappedFields: z.array(Input)
  });

  try {
    const { formMap, userData } = req.body;

    if (!formMap || !userData) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }
    // Prepare the prompt for GPT
  const prompt = `
    I have a web form with the following fields:
    ${formMap.map(field => `
      - Field: ${field.label || field.name || field.id}
      - Type: ${field.type}
      - Context: ${field.nearbyText}
    `).join('\n')}

    And I have the following user information:
    ${userData}

    Please analyze the form fields and provide the appropriate values from the user information.
    Return the response as an array of JSON objects where the keys are the field IDs and the values are what should be filled in.
  `;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that fills out forms based on user data." 
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: zodResponseFormat.zodResponseFormat(ProcessedData, "processedData")
    });

    const processedData = JSON.parse(completion.choices[0].message.content);

    console.log(processedData);

    res.json({ 
      success: true,
      processedData: processedData
    });

  } catch (error) {
    console.error('Error processing form:', error);
    res.status(500).json({ 
      error: 'Failed to process form',
      message: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something broke!',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});