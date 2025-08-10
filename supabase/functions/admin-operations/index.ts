import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface AdminOperationRequest {
  operation: 'create_admin' | 'assign_admin_role' | 'check_admin_exists'
  email?: string
  password?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const body: AdminOperationRequest = await req.json()
    const { operation, email, password } = body

    switch (operation) {
      case 'check_admin_exists': {
        if (!email) {
          return new Response(
            JSON.stringify({ error: 'Email is required' }),
            { status: 400, headers: corsHeaders }
          )
        }

        // Check if user exists
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        if (listError) {
          return new Response(
            JSON.stringify({ error: listError.message }),
            { status: 500, headers: corsHeaders }
          )
        }

        const adminUser = users.users?.find(user => user.email === email)
        
        if (adminUser) {
          // Check if user has admin role
          const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('*')
            .eq('user_id', adminUser.id)
            .eq('role', 'admin')
            .single()

          return new Response(
            JSON.stringify({ 
              exists: true, 
              hasAdminRole: !roleError && !!roleData,
              userId: adminUser.id 
            }),
            { status: 200, headers: corsHeaders }
          )
        }

        return new Response(
          JSON.stringify({ exists: false, hasAdminRole: false }),
          { status: 200, headers: corsHeaders }
        )
      }

      case 'create_admin': {
        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: 'Email and password are required' }),
            { status: 400, headers: corsHeaders }
          )
        }

        // Create admin user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            full_name: 'Admin User',
            user_type: 'admin'
          }
        })

        if (authError) {
          return new Response(
            JSON.stringify({ error: authError.message }),
            { status: 400, headers: corsHeaders }
          )
        }

        if (!authData.user) {
          return new Response(
            JSON.stringify({ error: 'Failed to create user' }),
            { status: 500, headers: corsHeaders }
          )
        }

        // Assign admin role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: 'admin'
          })

        if (roleError && roleError.code !== '23505') { // Ignore duplicate key error
          console.error('Error assigning admin role:', roleError)
          // Don't fail the request, just log the error
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            userId: authData.user.id,
            email: authData.user.email 
          }),
          { status: 200, headers: corsHeaders }
        )
      }

      case 'assign_admin_role': {
        if (!email) {
          return new Response(
            JSON.stringify({ error: 'Email is required' }),
            { status: 400, headers: corsHeaders }
          )
        }

        // Find user by email
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        if (listError) {
          return new Response(
            JSON.stringify({ error: listError.message }),
            { status: 500, headers: corsHeaders }
          )
        }

        const user = users.users?.find(u => u.email === email)
        if (!user) {
          return new Response(
            JSON.stringify({ error: 'User not found' }),
            { status: 404, headers: corsHeaders }
          )
        }

        // Assign admin role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: user.id,
            role: 'admin'
          })

        if (roleError && roleError.code !== '23505') { // Ignore duplicate key error
          return new Response(
            JSON.stringify({ error: roleError.message }),
            { status: 400, headers: corsHeaders }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: corsHeaders }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid operation' }),
          { status: 400, headers: corsHeaders }
        )
    }

  } catch (error) {
    console.error('Error in admin-operations:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})