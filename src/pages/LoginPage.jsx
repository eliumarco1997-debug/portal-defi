import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor, ingresa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErrorMsg(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor, ingresa tu correo y contraseña para registrarte.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setErrorMsg(error.message);
    } else {
      setSuccessMsg('¡Registro exitoso! Ya puedes iniciar sesión.');
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMsg('Primero escribe tu correo arriba y luego haz clic en "Olvidé mi contraseña".');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setErrorMsg(error.message);
    } else {
      setSuccessMsg('✅ Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h2>Bienvenido a Portal DeFi</h2>
          <p>Inicia sesión o regístrate para continuar</p>
        </div>

        {errorMsg && <div className="error-message">{errorMsg}</div>}
        {successMsg && (
          <div className="error-message" style={{ background: 'rgba(50,205,50,0.15)', borderColor: 'rgba(50,205,50,0.4)', color: '#32cd32' }}>
            {successMsg}
          </div>
        )}

        <div className="login-form">
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="actions">
            <button type="button" className="btn-primary" onClick={handleLogin} disabled={loading}>
              {loading ? 'Cargando...' : 'Iniciar Sesión'}
            </button>
            <button type="button" className="btn-secondary" onClick={handleSignUp} disabled={loading}>
              {loading ? 'Cargando...' : 'Registrarse'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                textDecoration: 'underline',
                padding: '4px'
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
