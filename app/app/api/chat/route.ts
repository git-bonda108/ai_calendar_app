
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClient } from '../../../prisma/generated/client'

const prisma = new PrismaClient()

// Validation schema for AI chat messages
const aiChatSchema = z.object({
  message: z.string().min(1, 'Message is required')
})

// Validation schema for regular chat conversations
const chatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  response: z.string().min(1, 'Response is required')
})

// Function to simulate AI responses (fallback implementation)
async function callAbacusAI(message: string, context: any[] = []) {
  try {
    // Get current bookings for context
    const bookings = await prisma.booking.findMany({
      orderBy: { startTime: 'asc' }
    })

    const currentDate = new Date()
    const messageText = message.toLowerCase()

    // Check for show/list requests first
    if (messageText.includes('show') || messageText.includes('list') || messageText.includes('my bookings')) {
      if (bookings.length === 0) {
        return "You don't have any bookings scheduled yet. Would you like me to help you schedule something?"
      }
      
      const bookingsList = bookings.map(b => 
        `• ${b.title} on ${b.startTime.toLocaleDateString()} from ${b.startTime.toLocaleTimeString()} to ${b.endTime.toLocaleTimeString()}`
      ).join('\n')
      
      return `Here are your upcoming bookings:\n\n${bookingsList}\n\nWould you like me to help you schedule something else or modify any of these?`
    }
    
    // Simple pattern matching for common scheduling requests
    if (messageText.includes('schedule') || messageText.includes('book') || messageText.includes('meeting')) {
      // Extract potential meeting details
      const titleMatch = messageText.match(/schedule\s+(?:a\s+)?(.+?)(?:\s+(?:on|at|from|for)|\s*$)/i)
      const title = titleMatch ? titleMatch[1].trim() : 'New Meeting'
      
      // Look for time patterns - improved to handle ranges
      const timeRangeMatch = messageText.match(/from\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+to\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i)
      const timeMatch = messageText.match(/(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/i)
      const dateMatch = messageText.match(/(?:on\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?|(?:on\s+)?(\d{1,2})-([a-z]{3})|(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)
      
      let startTime = new Date(currentDate)
      let endTime = new Date(currentDate)
      
      // Set time based on patterns found
      if (timeRangeMatch) {
        // Handle time range (from X to Y)
        const startHour = parseInt(timeRangeMatch[1])
        const startMinute = parseInt(timeRangeMatch[2] || '0')
        const startPM = timeRangeMatch[3]?.toLowerCase() === 'pm'
        
        const endHour = parseInt(timeRangeMatch[4])
        const endMinute = parseInt(timeRangeMatch[5] || '0')
        const endPM = timeRangeMatch[6]?.toLowerCase() === 'pm'
        
        startTime.setHours(startPM && startHour !== 12 ? startHour + 12 : startHour, startMinute, 0, 0)
        endTime.setHours(endPM && endHour !== 12 ? endHour + 12 : endHour, endMinute, 0, 0)
      } else if (timeMatch) {
        // Handle single time
        const hour = parseInt(timeMatch[1])
        const minute = parseInt(timeMatch[2] || '0')
        const isPM = timeMatch[3]?.toLowerCase() === 'pm'
        
        startTime.setHours(isPM && hour !== 12 ? hour + 12 : hour, minute, 0, 0)
        endTime.setHours(startTime.getHours() + 1, minute, 0, 0) // Default 1 hour duration
      } else {
        // Default to 9 AM if no time specified
        startTime.setHours(9, 0, 0, 0)
        endTime.setHours(10, 0, 0, 0)
      }
      
      // Handle date
      if (dateMatch) {
        if (dateMatch[5]) {
          // Handle day names
          const dayName = dateMatch[5].toLowerCase()
          if (dayName === 'today') {
            // Keep current date
          } else if (dayName === 'tomorrow') {
            startTime.setDate(startTime.getDate() + 1)
            endTime.setDate(endTime.getDate() + 1)
          } else {
            // Handle day names (simplified)
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            const targetDay = days.indexOf(dayName)
            if (targetDay !== -1) {
              const currentDay = startTime.getDay()
              const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7
              startTime.setDate(startTime.getDate() + daysUntilTarget)
              endTime.setDate(endTime.getDate() + daysUntilTarget)
            }
          }
        } else if (dateMatch[1] && dateMatch[4]) {
          // Handle DD-MMM format (e.g., 08-Jul)
          const day = parseInt(dateMatch[1])
          const monthAbbr = dateMatch[4].toLowerCase()
          const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
          const month = months.indexOf(monthAbbr)
          
          if (month !== -1) {
            const year = currentDate.getFullYear()
            startTime.setFullYear(year, month, day)
            endTime.setFullYear(year, month, day)
          }
        } else if (dateMatch[1] && dateMatch[2]) {
          // Handle MM/DD format
          const month = parseInt(dateMatch[1]) - 1 // JavaScript months are 0-indexed
          const day = parseInt(dateMatch[2])
          const year = dateMatch[3] ? parseInt(dateMatch[3]) : currentDate.getFullYear()
          
          startTime.setFullYear(year, month, day)
          endTime.setFullYear(year, month, day)
        }
      } else {
        // Default to tomorrow if no date specified
        startTime.setDate(startTime.getDate() + 1)
        endTime.setDate(endTime.getDate() + 1)
      }

      return JSON.stringify({
        action: 'create',
        booking: {
          title: title,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        response: `I'll schedule "${title}" for ${startTime.toLocaleDateString()} from ${startTime.toLocaleTimeString()} to ${endTime.toLocaleTimeString()}. Is this correct?`
      })
    }
    
    if (messageText.includes('cancel') || messageText.includes('delete') || messageText.includes('remove')) {
      if (bookings.length === 0) {
        return "You don't have any bookings to cancel. Would you like me to help you schedule something?"
      }
      
      // For now, just show available bookings to cancel
      const bookingsList = bookings.map((b, index) => 
        `${index + 1}. ${b.title} on ${b.startTime.toLocaleDateString()} at ${b.startTime.toLocaleTimeString()}`
      ).join('\n')
      
      return `Which booking would you like to cancel?\n\n${bookingsList}\n\nPlease tell me the number or name of the booking you'd like to cancel.`
    }
    
    // Default helpful response
    return `Hello! I'm Schedula, your intelligent scheduling assistant. I can help you:

• Schedule new meetings and appointments
• Show your existing bookings
• Cancel or modify existing bookings
• Check your availability

What would you like me to help you with today? You can say things like:
- "Schedule a meeting tomorrow at 2 PM"
- "Show my bookings"
- "Book Gen AI training from 9 AM to 1 PM on July 8th"`

  } catch (error) {
    console.error('Error in AI simulation:', error)
    throw error
  }
}

// Function to process booking operations
async function processBookingOperation(aiResponse: string) {
  try {
    // Try to extract structured data from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { response: aiResponse, bookingCreated: false }
    }

    const structured = JSON.parse(jsonMatch[0])
    
    if (structured.action === 'create' && structured.booking) {
      const booking = await prisma.booking.create({
        data: {
          title: structured.booking.title,
          startTime: new Date(structured.booking.startTime),
          endTime: new Date(structured.booking.endTime)
        }
      })
      
      return {
        response: structured.response || `Successfully scheduled "${booking.title}" from ${booking.startTime.toLocaleString()} to ${booking.endTime.toLocaleString()}`,
        bookingCreated: true,
        booking
      }
    }
    
    if (structured.action === 'update' && structured.booking) {
      const booking = await prisma.booking.update({
        where: { id: structured.booking.id },
        data: {
          title: structured.booking.title,
          startTime: new Date(structured.booking.startTime),
          endTime: new Date(structured.booking.endTime)
        }
      })
      
      return {
        response: structured.response || `Successfully updated "${booking.title}"`,
        bookingCreated: true,
        booking
      }
    }
    
    if (structured.action === 'delete' && structured.booking) {
      await prisma.booking.delete({
        where: { id: structured.booking.id }
      })
      
      return {
        response: structured.response || `Successfully deleted the booking`,
        bookingCreated: true
      }
    }
    
    return { response: structured.response || aiResponse, bookingCreated: false }
  } catch (error) {
    console.error('Error processing booking operation:', error)
    return { response: aiResponse, bookingCreated: false }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const skip = (page - 1) * limit

    const [conversations, total] = await Promise.all([
      prisma.chatConversation.findMany({
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' }
      }),
      prisma.chatConversation.count()
    ])

    return NextResponse.json({
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching chat conversations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat conversations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Check if this is an AI chat request (has only 'message') or regular chat (has 'message' and 'response')
    if (body.response) {
      // Regular chat conversation storage
      const validatedData = chatSchema.parse(body)
      const conversation = await prisma.chatConversation.create({
        data: {
          message: validatedData.message,
          response: validatedData.response
        }
      })
      return NextResponse.json(conversation, { status: 201 })
    } else {
      // AI chat request
      const validatedData = aiChatSchema.parse(body)
      
      // Get AI response
      const aiResponse = await callAbacusAI(validatedData.message)
      
      // Process any booking operations
      const result = await processBookingOperation(aiResponse)
      
      // Store the conversation
      await prisma.chatConversation.create({
        data: {
          message: validatedData.message,
          response: result.response
        }
      })
      
      // Generate suggestions based on the conversation
      const suggestions = [
        "Show my upcoming bookings",
        "What's my availability tomorrow?",
        "Schedule another meeting",
        "Cancel a booking"
      ]
      
      return NextResponse.json({
        response: result.response,
        bookingCreated: result.bookingCreated,
        booking: result.booking,
        suggestions
      })
    }
  } catch (error) {
    console.error('Error in chat API:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { 
        response: "I apologize, but I'm experiencing connectivity issues. Please try again in a moment.",
        bookingCreated: false,
        suggestions: [
          "Try scheduling again",
          "Check my calendar",
          "What can you help me with?",
          "Show my bookings"
        ]
      },
      { status: 200 } // Return 200 so the frontend can display the error message
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      )
    }

    await prisma.chatConversation.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Conversation deleted successfully' })
  } catch (error) {
    console.error('Error deleting chat conversation:', error)
    return NextResponse.json(
      { error: 'Failed to delete chat conversation' },
      { status: 500 }
    )
  }
}
