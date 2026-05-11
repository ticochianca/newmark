import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { nome, email, senha, perfil } = await request.json();

    if (!nome || !email || !senha || !perfil) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    // Inicializa o cliente do Supabase com a Service Role Key para ignorar RLS e criar usuários na Auth
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 1. Cria o usuário na tabela de Autenticação (auth.users)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: senha,
      email_confirm: true, // Já confirma o email automaticamente
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Insere/Atualiza o perfil na tabela pública (public.profiles)
    // O Supabase pode já ter inserido um profile vazio se houver uma trigger no banco,
    // então usamos upsert para garantir que vamos atualizar com os dados corretos.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        nome: nome,
        perfil: perfil,
        ativo: true
      });

    if (profileError) {
      // Se falhar no profile, a boa prática seria deletar o auth user, mas para simplificar vamos apenas avisar
      console.error('Erro ao salvar profile:', profileError);
      return NextResponse.json({ error: 'Usuário criado no Auth, mas erro ao salvar perfil: ' + profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Usuário criado com sucesso!' }, { status: 201 });

  } catch (error) {
    console.error('Erro interno:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
